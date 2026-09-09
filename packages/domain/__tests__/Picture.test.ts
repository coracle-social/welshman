import {describe, it, expect} from "vitest"
import {makeSecret, PICTURE_NOTE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Picture} from "../src/kinds/Picture"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const hash = "11".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: PICTURE_NOTE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Picture", () => {
  it("reads a title, images, and the optional place tags", async () => {
    const picture = await read(
      Picture,
      makeEvent({
        content: "a day out",
        tags: [
          ["title", "Sunrise"],
          ["imeta", "url https://example.com/a.jpg", "m image/jpeg"],
          ["t", "photography"],
          ["location", "Lisbon"],
          ["g", "ez3"],
        ],
      }),
    )

    expect(picture.title()).toBe("Sunrise")
    expect(picture.content()).toBe("a day out")
    expect(picture.topics()).toEqual(["photography"])
    expect(picture.location()).toBe("Lisbon")
    expect(picture.geohash()).toBe("ez3")
    expect(picture.imeta()).toEqual([
      {url: "https://example.com/a.jpg", mimeType: "image/jpeg", fallbacks: [], extra: []},
    ])
  })

  it("mirrors each image's hash and mime type at the top level", async () => {
    const tmpl = await buildTemplate(
      write(Picture)
        .setTitle("Sunrise")
        .addImeta({url: "https://example.com/a.jpg", mimeType: "image/jpeg", hash})
        .addImeta({url: "https://example.com/b.jpg", mimeType: "image/jpeg"}),
      signer,
    )

    expect(tmpl.kind).toBe(PICTURE_NOTE)
    expect(tmpl.tags.filter(t => t[0] === "imeta").length).toBe(2)
    expect(tmpl.tags.filter(t => t[0] === "x")).toEqual([["x", hash]])
    expect(tmpl.tags.filter(t => t[0] === "m")).toEqual([["m", "image/jpeg"]])
  })

  it("round-trips an image without duplicating its derived tags", async () => {
    const event = makeEvent({
      tags: [
        ["title", "Sunrise"],
        [
          "imeta",
          "url https://example.com/a.jpg",
          "m image/jpeg",
          `x ${hash}`,
          "alt A sunrise over the sea",
          "annotate-user " + pubkey + ":10:20",
        ],
        ["x", hash],
        ["m", "image/jpeg"],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(write(Picture, await read(Picture, event)), signer)

    expect(tmpl.tags.filter(t => t[0] === "x")).toEqual([["x", hash]])
    expect(tmpl.tags.filter(t => t[0] === "m")).toEqual([["m", "image/jpeg"]])
    // An untouched imeta tag passes through exactly as it was written.
    expect(tmpl.tags.filter(t => t[0] === "imeta")).toEqual(
      event.tags.filter(t => t[0] === "imeta"),
    )
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("requires an image", async () => {
    await expect(buildTemplate(write(Picture).setTitle("Sunrise"), signer)).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Picture, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
