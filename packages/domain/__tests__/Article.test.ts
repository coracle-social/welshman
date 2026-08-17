import {describe, it, expect} from "vitest"
import {makeSecret, LONG_FORM, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Article} from "../src/kinds/Article"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: LONG_FORM,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Article", () => {
  it("reads represented tags and content", async () => {
    const event = makeEvent({
      content: "# Heading\n\nbody",
      tags: [
        ["d", "abc"],
        ["title", "On Relays"],
        ["summary", "A good read"],
        ["image", "https://example.com/a.jpg"],
        ["published_at", "1700000000"],
        ["t", "nostr"],
        ["t", "relays"],
        ["alt", "x"],
      ],
    })

    const article = await read(Article, event)

    expect(article.identifier()).toBe("abc")
    expect(article.title()).toBe("On Relays")
    expect(article.summary()).toBe("A good read")
    expect(article.image()).toBe("https://example.com/a.jpg")
    expect(article.publishedAt()).toBe(1700000000)
    expect(article.topics()).toEqual(["nostr", "relays"])
    expect(article.content()).toBe("# Heading\n\nbody")
  })

  it("falls back to created_at when published_at is missing or malformed", async () => {
    const withoutTag = await read(Article, makeEvent({created_at: 100}))
    const withGarbage = await read(
      Article,
      makeEvent({created_at: 100, tags: [["published_at", "soon"]]}),
    )

    expect(withoutTag.publishedAt()).toBe(100)
    expect(withGarbage.publishedAt()).toBe(100)
  })

  it("round-trips with no duplicate represented tags", async () => {
    const event = makeEvent({
      content: "body",
      tags: [
        ["d", "abc"],
        ["title", "On Relays"],
        ["summary", "A good read"],
        ["image", "https://example.com/a.jpg"],
        ["published_at", "1700000000"],
        ["t", "nostr"],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(write(Article, await read(Article, event)), signer)

    for (const key of ["d", "title", "summary", "image", "published_at", "t"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags).toContainEqual(["d", "abc"])
    expect(tmpl.tags).toContainEqual(["published_at", "1700000000"])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe("body")
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(Article)
        .setIdentifier("article1")
        .setTitle("Fresh")
        .setContent("body")
        .setSummary("teaser")
        .setImage("https://example.com/c.jpg")
        .setPublishedAt(1700000000)
        .setTopics(["misc"]),
      signer,
    )

    expect(tmpl.kind).toBe(LONG_FORM)
    expect(tmpl.tags).toContainEqual(["d", "article1"])
    expect(tmpl.tags).toContainEqual(["title", "Fresh"])
    expect(tmpl.tags).toContainEqual(["summary", "teaser"])
    expect(tmpl.tags).toContainEqual(["image", "https://example.com/c.jpg"])
    expect(tmpl.tags).toContainEqual(["published_at", "1700000000"])
    expect(tmpl.tags).toContainEqual(["t", "misc"])
    expect(tmpl.content).toBe("body")
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Article, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
