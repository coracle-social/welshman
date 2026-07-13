import {describe, it, expect} from "vitest"
import {makeSecret, RELAY_MEMBERS, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RelayMembers} from "../src/kinds/RelayMembers"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const a = "aa".repeat(32)
const b = "bb".repeat(32)
const c = "cc".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: RELAY_MEMBERS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RelayMembers", () => {
  it("reads members from member tags", async () => {
    const members = await read(RelayMembers, 
      makeEvent({
        tags: [
          ["member", a],
          ["member", b],
          ["member", a],
        ],
      }),
    )

    expect(members.pubkeys().sort()).toEqual([a, b].sort())
    expect(members.isMember(a)).toBe(true)
    expect(members.isMember(c)).toBe(false)
  })

  it("round-trips with deduped member tags and passthrough", async () => {
    const members = await read(RelayMembers, 
      makeEvent({
        tags: [
          ["member", a],
          ["member", b],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(
      write(RelayMembers, members).forceRelays("wss://relay.example.com/"),
      signer,
    )

    expect(tmpl.kind).toBe(RELAY_MEMBERS)
    expect(tmpl.tags.filter(t => t[0] === "member").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["member", a])
    expect(tmpl.tags).toContainEqual(["member", b])
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("adds and removes members via the builder", async () => {
    const tmpl = await buildTemplate(write(RelayMembers)
      .addPubkey(a)
      .addPubkey(b)
      .addPubkey(a)
      .removePubkey(b)
      .forceRelays("wss://relay.example.com/"), signer)

    expect(tmpl.tags.filter(t => t[0] === "member").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["member", a])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RelayMembers, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
