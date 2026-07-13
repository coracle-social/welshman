import {describe, it, expect} from "vitest"
import {makeSecret, FEED, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Feed} from "../src/kinds/Feed"
import {buildTemplate, read, write} from "./helpers.js"

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

    const feed = await read(Feed, event)

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
        ["zzz", "x"],
      ],
    })

    const tmpl = await buildTemplate(write(Feed, await read(Feed, event)), signer)

    for (const key of ["d", "title", "description", "feed"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags).toContainEqual(["d", "abc"])
    expect(tmpl.tags).toContainEqual(["title", "My Feed"])
    expect(tmpl.tags).toContainEqual(["feed", JSON.stringify(definition)])
    // Unmodeled tags pass through untouched.
    expect(tmpl.tags).toContainEqual(["alt", "My Feed"])
    expect(tmpl.tags).toContainEqual(["zzz", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(write(Feed)
      .setIdentifier("feed1")
      .setTitle("Fresh")
      .setDescription("desc")
      .setDefinition(definition), signer)

    expect(tmpl.kind).toBe(FEED)
    expect(tmpl.tags).toContainEqual(["d", "feed1"])
    expect(tmpl.tags).toContainEqual(["title", "Fresh"])
    expect(tmpl.tags).toContainEqual(["description", "desc"])
    expect(tmpl.tags).toContainEqual(["feed", JSON.stringify(definition)])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Feed, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
