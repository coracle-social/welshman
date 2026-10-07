import {describe, it, expect} from "vitest"
import {NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {getImeta, parseImeta, renderImeta} from "../src/behaviors/Imeta"
import {Note} from "../src/kinds/Note"
import {buildTemplate, write} from "./helpers.js"

const pubkey = "ee".repeat(32)
const hash = "11".repeat(32)

const makeEvent = (tags: string[][]): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: NOTE,
    tags,
    content: "",
    sig: "00".repeat(64),
  }) as TrustedEvent

describe("getImeta", () => {
  it("parses the modeled entries and keeps the rest verbatim", () => {
    const imeta = getImeta(
      makeEvent([
        [
          "imeta",
          "url https://example.com/a.jpg",
          "m image/jpeg",
          "blurhash bh",
          "dim 3024x4032",
          "alt A sunrise over the sea",
          `x ${hash}`,
          "fallback https://mirror.example.com/a.jpg",
          "annotate-user " + pubkey + ":10:20",
        ],
        ["imeta", "url https://example.com/b.jpg"],
        ["alt", "x"],
      ]),
    )

    expect(imeta).toEqual([
      {
        url: "https://example.com/a.jpg",
        mimeType: "image/jpeg",
        blurhash: "bh",
        dim: "3024x4032",
        // The value keeps its spaces: only the first one separates key from value.
        alt: "A sunrise over the sea",
        hash,
        fallbacks: ["https://mirror.example.com/a.jpg"],
        extra: ["annotate-user " + pubkey + ":10:20"],
      },
      {url: "https://example.com/b.jpg", fallbacks: [], extra: []},
    ])
  })

  it("reads an imeta tag with no url", () => {
    expect(getImeta(makeEvent([["imeta", "m image/jpeg", "blurhash bh"]]))).toEqual([
      {url: "", mimeType: "image/jpeg", blurhash: "bh", fallbacks: [], extra: []},
    ])
  })

  it("reads an attachment addressed only by its hash", () => {
    expect(getImeta(makeEvent([["imeta", "x abc", "m image/jpeg"]]))).toEqual([
      {url: "", hash: "abc", mimeType: "image/jpeg", fallbacks: [], extra: []},
    ])
  })
})

describe("parseImeta", () => {
  it("ignores a tag that isn't an imeta tag", () => {
    expect(parseImeta(["emoji", "blobcat", "https://example.com/blobcat.png"])).toBeUndefined()
  })
})

describe("renderImeta", () => {
  it("round-trips an attachment, unmodeled entries included", () => {
    const imeta = {
      url: "https://example.com/a.jpg",
      mimeType: "image/jpeg",
      alt: "A sunrise over the sea",
      hash,
      fallbacks: ["https://mirror.example.com/a.jpg"],
      extra: ["annotate-user " + pubkey + ":10:20"],
    }

    expect(parseImeta(renderImeta(imeta))).toEqual(imeta)
  })
})

describe("a writer's attachments", () => {
  it("attaches media to any kind", async () => {
    const tmpl = await buildTemplate(
      write(Note)
        .setContent("a day out")
        .addImeta({url: "https://example.com/a.jpg", mimeType: "image/jpeg"}),
    )

    expect(tmpl.tags).toContainEqual(["imeta", "url https://example.com/a.jpg", "m image/jpeg"])
  })

  it("keeps every attachment added, even at the same url", async () => {
    const tmpl = await buildTemplate(
      write(Note)
        .addImeta({url: "https://example.com/a.jpg", alt: "first"})
        .addImeta({url: "https://example.com/a.jpg", alt: "second"}),
    )

    expect(tmpl.tags.filter(t => t[0] === "imeta")).toEqual([
      ["imeta", "url https://example.com/a.jpg", "alt first"],
      ["imeta", "url https://example.com/a.jpg", "alt second"],
    ])
  })

  it("drops an attachment", async () => {
    const tmpl = await buildTemplate(
      write(Note)
        .addImeta({url: "https://example.com/a.jpg"})
        .addImeta({url: "https://example.com/b.jpg"})
        .removeImeta(imeta => imeta.url === "https://example.com/a.jpg"),
    )

    expect(tmpl.tags.filter(t => t[0] === "imeta")).toEqual([
      ["imeta", "url https://example.com/b.jpg"],
    ])
  })

  it("drops an attachment by its hash, and leaves every other tag alone", async () => {
    const tmpl = await buildTemplate(
      write(Note)
        .setContentWarning("spoilers")
        .addImeta({url: "", hash: "abc"})
        .addImeta({url: "", hash: "def"})
        .removeImeta(imeta => imeta.hash === "def"),
    )

    expect(tmpl.tags.filter(t => t[0] === "imeta")).toEqual([["imeta", "x abc"]])
    expect(tmpl.tags).toContainEqual(["content-warning", "spoilers"])
  })
})
