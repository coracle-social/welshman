import {describe, it, expect} from "vitest"
import {makeSecret, Resolver, COMMENT, LONG_FORM, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Comment, getCommentTags, getCommentTagValues} from "../src/kinds/Comment"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const rootId = "aa".repeat(32)
const rootPubkey = "bb".repeat(32)
const parentId = "cc".repeat(32)
const parentPubkey = "dd".repeat(32)

// Resolves every author's outbox to one recognizable url, so hint placement is visible.
const HINT = "wss://hint.test/"
const hintResolver = new Resolver(route => (route.type === "pubkeyOutbox" ? [HINT] : []))

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: COMMENT,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Comment", () => {
  it("reads root and parent references", async () => {
    const event = makeEvent({
      content: "nice thread",
      tags: [
        ["E", rootId],
        ["K", "11"],
        ["P", rootPubkey],
        ["e", parentId],
        ["k", "1111"],
        ["p", parentPubkey],
        ["alt", "x"],
      ],
    })

    const comment = await read(Comment, event)

    expect(comment.content()).toBe("nice thread")
    expect(comment.root()).toEqual({id: rootId, address: undefined, kind: "11", pubkey: rootPubkey})
    expect(comment.parent()).toEqual({
      id: parentId,
      address: undefined,
      kind: "1111",
      pubkey: parentPubkey,
    })
  })

  it("round-trips with no duplicate reference tags", async () => {
    const event = makeEvent({
      content: "nice thread",
      tags: [
        ["E", rootId],
        ["K", "11"],
        ["P", rootPubkey],
        ["e", parentId],
        ["k", "1111"],
        ["p", parentPubkey],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(write(Comment, await read(Comment, event)), signer)

    // Each represented reference key emits exactly once.
    for (const key of ["E", "K", "P", "e", "k", "p"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags).toContainEqual(["E", rootId])
    expect(tmpl.tags).toContainEqual(["e", parentId])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe("nice thread")
  })

  it("builds references from full events", async () => {
    const root = makeEvent({id: rootId, pubkey: rootPubkey, kind: 11})
    const parent = makeEvent({id: parentId, pubkey: parentPubkey, kind: 1111})

    const tmpl = await buildTemplate(
      write(Comment).setContent("reply").setRootFromEvent(root).setParentFromEvent(parent),
      signer,
    )

    expect(tmpl.kind).toBe(COMMENT)
    expect(tmpl.tags).toContainEqual(["E", rootId, "", rootPubkey])
    expect(tmpl.tags).toContainEqual(["K", "11"])
    expect(tmpl.tags).toContainEqual(["P", rootPubkey, ""])
    expect(tmpl.tags).toContainEqual(["e", parentId, "", parentPubkey])
    expect(tmpl.tags).toContainEqual(["k", "1111"])
    expect(tmpl.tags).toContainEqual(["p", parentPubkey, ""])
    expect(tmpl.content).toBe("reply")
  })

  // NIP-22 puts the referenced event's pubkey after the relay hint on E/e tags.
  // The hint arrives asynchronously, so it has to land in its own slot rather
  // than being appended over the pubkey.
  it("keeps the referenced pubkey after the relay hint on E and e tags", async () => {
    const root = makeEvent({id: rootId, pubkey: rootPubkey, kind: 11})
    const parent = makeEvent({id: parentId, pubkey: parentPubkey, kind: 1111})

    const tmpl = await buildTemplate(
      write(Comment, undefined, hintResolver)
        .setContent("reply")
        .setRootFromEvent(root)
        .setParentFromEvent(parent),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["E", rootId, HINT, rootPubkey])
    expect(tmpl.tags).toContainEqual(["e", parentId, HINT, parentPubkey])
    // P/p tags are [key, pubkey, hint], with no fourth element.
    expect(tmpl.tags).toContainEqual(["P", rootPubkey, HINT])
    expect(tmpl.tags).toContainEqual(["p", parentPubkey, HINT])
  })

  it("addresses an addressable root and parent", async () => {
    const root = makeEvent({
      id: rootId,
      pubkey: rootPubkey,
      kind: LONG_FORM,
      tags: [["d", "article"]],
    })

    const tmpl = await buildTemplate(
      write(Comment, undefined, hintResolver).setRootFromEvent(root).setParentFromEvent(root),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["A", `${LONG_FORM}:${rootPubkey}:article`, HINT])
    expect(tmpl.tags).toContainEqual(["a", `${LONG_FORM}:${rootPubkey}:article`, HINT])
  })

  // An address only identifies an event for addressable kinds, so a `d` tag on a
  // regular event doesn't make one.
  it("omits A and a tags for a non-addressable kind carrying a d tag", async () => {
    const root = makeEvent({id: rootId, pubkey: rootPubkey, kind: NOTE, tags: [["d", "foo"]]})

    const tmpl = await buildTemplate(
      write(Comment, undefined, hintResolver).setRootFromEvent(root).setParentFromEvent(root),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "A")).toEqual([])
    expect(tmpl.tags.filter(t => t[0] === "a")).toEqual([])
    expect(tmpl.tags).toContainEqual(["E", rootId, HINT, rootPubkey])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Comment, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})

describe("getCommentTags", () => {
  const eventId = "ff".repeat(32)

  it("splits uppercase root and lowercase parent reference tags", () => {
    const tags = [
      ["E", eventId],
      ["e", eventId],
      ["P", pubkey],
      ["p", pubkey],
      ["K", "1"],
      ["k", "1"],
    ]

    const {roots, replies} = getCommentTags(tags)

    expect(roots).toHaveLength(3)
    expect(replies).toHaveLength(3)

    const values = getCommentTagValues(tags)

    expect(values.roots).toContain(eventId)
    expect(values.replies).toContain(eventId)
  })
})
