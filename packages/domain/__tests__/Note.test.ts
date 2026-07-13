import {describe, it, expect} from "vitest"
import {makeSecret, NOTE, FOLLOWS, getPubkeyTagValues, getEventTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Note} from "../src/kinds/Note"
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
    expect(getPubkeyTagValues(tmpl.tags)).toContain(parentPubkey)
    expect(getEventTagValues(tmpl.tags)).toContain(parentId)
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

  it("throws on the wrong kind", async () => {
    await expect(read(Note, makeEvent({kind: FOLLOWS}))).rejects.toThrow()
  })
})
