import {describe, it, expect} from "vitest"
import {makeSecret, RELAY_ADD_MEMBER, RELAY_REMOVE_MEMBER} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RelayRemoveMember} from "../src/kinds/RelayRemoveMember"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const a = "aa".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: RELAY_REMOVE_MEMBER,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RelayRemoveMember", () => {
  it("reads affected pubkeys with the remove kind", async () => {
    const op = await read(RelayRemoveMember, makeEvent({tags: [["p", a]]}))

    expect(op.kind).toBe(RELAY_REMOVE_MEMBER)
    expect(op.pubkeys()).toEqual([a])
  })

  it("builds fresh with the remove kind", async () => {
    const tmpl = await buildTemplate(
      write(RelayRemoveMember).addPubkey(a).forceRelays("wss://relay.example.com/"),
      signer,
    )

    expect(tmpl.kind).toBe(RELAY_REMOVE_MEMBER)
    expect(tmpl.tags).toContainEqual(["p", a])
  })

  it("throws when the add kind is read as a remove", async () => {
    await expect(read(RelayRemoveMember, makeEvent({kind: RELAY_ADD_MEMBER}))).rejects.toThrow()
  })
})
