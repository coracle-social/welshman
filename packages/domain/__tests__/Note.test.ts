import {describe, it, expect} from "vitest"
import {makeSecret, NOTE, FOLLOWS, hexTags, tagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Note, getReplyTags} from "../src/kinds/Note"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const parentId = "aa".repeat(32)
const parentPubkey = "bb".repeat(32)

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: NOTE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("Note", () => {
  it("builds a reply that p-tags the parent author and e-tags the parent id", async () => {
    const parent = makeEvent({id: parentId, pubkey: parentPubkey})

    const tmpl = await buildTemplate(write(Note).setContent("hi").setParent(parent), signer)

    expect(tmpl.kind).toBe(NOTE)
    expect(tmpl.content).toBe("hi")
    expect(tagValues(hexTags("p"), tmpl.tags)).toContain(parentPubkey)
    expect(tagValues(hexTags("e"), tmpl.tags)).toContain(parentId)
  })

  it("round-trips a kind-1 event", async () => {
    const event = makeEvent({
      content: "gm",
      tags: [
        ["p", parentPubkey],
        ["t", "nostr"],
      ],
    })

    const reader = await read(Note, event)

    expect(reader.content()).toBe("gm")
    expect(reader.tags()).toEqual([
      ["p", parentPubkey],
      ["t", "nostr"],
    ])
  })

  it("reads and writes NIP-30 emoji tags", async () => {
    const reader = await read(
      Note,
      makeEvent({
        content: "gm :blobcat:",
        tags: [["emoji", "blobcat", "https://example.com/blobcat.png", "30030:abc:blobcats"]],
      }),
    )

    expect(reader.emojis()).toEqual([
      {shortcode: "blobcat", url: "https://example.com/blobcat.png", address: "30030:abc:blobcats"},
    ])

    // Optional emoji-set address, and dedup by shortcode.
    const tmpl = await buildTemplate(
      write(Note)
        .setContent(":a: :b:")
        .addEmoji("a", "https://example.com/a.png")
        .addEmoji("b", "https://example.com/b.png", "30030:abc:set")
        .addEmoji("a", "https://example.com/a2.png")
        .removeEmoji("b"),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "emoji")).toEqual([
      ["emoji", "a", "https://example.com/a2.png"],
    ])
  })

  it("reads and writes NIP-57 zap-split tags", async () => {
    const reader = await read(
      Note,
      makeEvent({
        tags: [
          ["zap", parentPubkey, "", "2"],
          ["zap", pubkey, "", "1"],
        ],
      }),
    )

    expect(reader.zapSplits()).toEqual([
      {pubkey: parentPubkey, relay: undefined, weight: 2},
      {pubkey: pubkey, relay: undefined, weight: 1},
    ])

    const tmpl = await buildTemplate(
      write(Note)
        .setContent("gm")
        .addZapSplit(parentPubkey, 3)
        .addZapSplit(pubkey)
        .removeZapSplit(pubkey),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "zap")).toEqual([["zap", parentPubkey, "", "3"]])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Note, makeEvent({kind: FOLLOWS}))).rejects.toThrow()
  })
})

describe("getReplyTags", () => {
  const eventId = "ff".repeat(32)
  const address = `30023:${pubkey}:test`

  it("splits marked root/reply/mention e and q tags", () => {
    const {roots, replies, mentions} = getReplyTags([
      ["e", eventId, "", "root"],
      ["e", eventId, "", "reply"],
      ["q", eventId],
    ])

    expect(roots).toHaveLength(1)
    expect(replies).toHaveLength(1)
    expect(mentions).toHaveLength(1)
  })

  it("infers position when markers are absent", () => {
    const {roots, replies, mentions} = getReplyTags([
      ["e", eventId],
      ["e", eventId],
      ["e", eventId],
    ])

    expect(roots).toHaveLength(1)
    expect(replies).toHaveLength(1)
    expect(mentions).toHaveLength(1)
  })

  it("handles marked address tags", () => {
    const {roots, replies} = getReplyTags([
      ["a", address, "", "root"],
      ["a", address, "", "reply"],
    ])

    expect(roots).toHaveLength(1)
    expect(replies).toHaveLength(1)
  })
})
