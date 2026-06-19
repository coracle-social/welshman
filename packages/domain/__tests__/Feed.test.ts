import {describe, it, expect} from "vitest"
import {makeSecret, FEED, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Feed, FeedBuilder} from "../src/kinds/Feed"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const definition = ["union", ["search", "nostr"]]

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: FEED,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Feed", () => {
  it("reads represented tags", async () => {
    const event = makeEvent({
      tags: [
        ["d", "abc"],
        ["title", "My Feed"],
        ["description", "all the things"],
        ["feed", JSON.stringify(definition)],
        ["alt", "My Feed"],
      ],
    })

    const feed = await Feed.fromEvent(event)

    expect(feed.identifier()).toBe("abc")
    expect(feed.title()).toBe("My Feed")
    expect(feed.description()).toBe("all the things")
    expect(feed.definition()).toEqual(definition)
  })

  it("round-trips with no duplicate represented tags", async () => {
    const event = makeEvent({
      tags: [
        ["d", "abc"],
        ["title", "My Feed"],
        ["description", "all the things"],
        ["feed", JSON.stringify(definition)],
        ["alt", "My Feed"],
        // "alt" is a represented/derived tag (mirrors title), so use a distinct
        // unknown key for the passthrough assertion.
        ["zzz", "x"],
      ],
    })

    const tmpl = await (await Feed.fromEvent(event)).builder().toTemplate(signer)

    for (const key of ["d", "title", "description", "feed", "alt"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags).toContainEqual(["d", "abc"])
    expect(tmpl.tags).toContainEqual(["title", "My Feed"])
    expect(tmpl.tags).toContainEqual(["feed", JSON.stringify(definition)])
    // The derived "alt" tag mirrors the title.
    expect(tmpl.tags).toContainEqual(["alt", "My Feed"])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["zzz", "x"])
  })

  it("builds from a fresh builder with an auto-generated d", async () => {
    const tmpl = await new FeedBuilder()
      .setTitle("Fresh")
      .setDescription("desc")
      .setDefinition(definition)
      .toTemplate(signer)

    expect(tmpl.kind).toBe(FEED)
    expect(tmpl.tags.find(t => t[0] === "d")?.[1]).toBeTruthy()
    expect(tmpl.tags).toContainEqual(["title", "Fresh"])
    expect(tmpl.tags).toContainEqual(["alt", "Fresh"])
    expect(tmpl.tags).toContainEqual(["description", "desc"])
    expect(tmpl.tags).toContainEqual(["feed", JSON.stringify(definition)])
  })

  it("throws on the wrong kind", async () => {
    await expect(Feed.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
