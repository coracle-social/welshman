import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_ADD_MEMBER, ROOM_REMOVE_MEMBER, getTagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomRemoveMember} from "../src/kinds/RoomRemoveMember"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const a = "aa".repeat(32)
const b = "bb".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOM_REMOVE_MEMBER,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomRemoveMember", () => {
  it("uses the remove kind and reads pubkeys", async () => {
    const op = await RoomRemoveMember.read(
      makeEvent({
        tags: [
          ["h", "room1"],
          ["p", a],
        ],
      }),
    )

    expect(op.kind).toBe(ROOM_REMOVE_MEMBER)
    expect(op.pubkeys()).toEqual([a])
  })

  it("round-trips through the remove builder", async () => {
    const op = await RoomRemoveMember.read(
      makeEvent({
        tags: [
          ["h", "room1"],
          ["p", a],
          ["p", b],
        ],
      }),
    )

    const tmpl = await RoomRemoveMember.builder(op)
      .setGroup("wss://relay.example.com/", "room1")
      .toTemplate(signer)

    expect(tmpl.kind).toBe(ROOM_REMOVE_MEMBER)
    expect(tmpl.tags.filter(t => t[0] === "h").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
    expect(getTagValue("h", tmpl.tags)).toBe("room1")
  })

  it("builds from a fresh remove builder", async () => {
    const tmpl = await RoomRemoveMember.builder()
      .setGroup("wss://relay.example.com/", "room2")
      .addPubkey(a)
      .toTemplate(signer)

    expect(tmpl.kind).toBe(ROOM_REMOVE_MEMBER)
    expect(getTagValue("h", tmpl.tags)).toBe("room2")
    expect(tmpl.tags).toContainEqual(["p", a])
  })

  it("throws on the wrong kind", async () => {
    await expect(
      RoomRemoveMember.read(makeEvent({kind: ROOM_ADD_MEMBER, tags: [["p", a]]})),
    ).rejects.toThrow()
  })
})
