import {describe, it, expect} from "vitest"
import {makeSecret, COMMENT, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Comment} from "../src/kinds/Comment"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const rootId = "aa".repeat(32)
const rootPubkey = "bb".repeat(32)
const parentId = "cc".repeat(32)
const parentPubkey = "dd".repeat(32)

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

    const comment = await Comment.read(event)

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

    const tmpl = await Comment.builder(await Comment.read(event)).toTemplate(signer)

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

    const tmpl = await Comment.builder()
      .setContent("reply")
      .setRootFromEvent(root)
      .setParentFromEvent(parent)
      .toTemplate(signer)

    expect(tmpl.kind).toBe(COMMENT)
    expect(tmpl.tags).toContainEqual(["E", rootId])
    expect(tmpl.tags).toContainEqual(["K", "11"])
    expect(tmpl.tags).toContainEqual(["P", rootPubkey])
    expect(tmpl.tags).toContainEqual(["e", parentId])
    expect(tmpl.tags).toContainEqual(["k", "1111"])
    expect(tmpl.tags).toContainEqual(["p", parentPubkey])
    expect(tmpl.content).toBe("reply")
  })

  it("throws on the wrong kind", async () => {
    await expect(Comment.read(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
