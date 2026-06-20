import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_MEMBERS, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomMembers, RoomMembersBuilder} from "../src/kinds/RoomMembers"

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
    kind: ROOM_MEMBERS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomMembers", () => {
  it("reads represented tags", async () => {
    const room = await RoomMembers.fromEvent(
      makeEvent({
        tags: [
          ["d", "room1"],
          ["p", a],
          ["p", b],
          ["alt", "x"],
        ],
      }),
    )

    expect(room.identifier()).toBe("room1")
    expect(room.members()).toEqual([a, b])
    expect(room.isMember(a)).toBe(true)
    expect(room.isMember(c)).toBe(false)
  })

  it("round-trips with no duplicated tags", async () => {
    const room = await RoomMembers.fromEvent(
      makeEvent({
        tags: [
          ["d", "room1"],
          ["p", a],
          ["p", b],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await room.builder().toTemplate(signer)

    expect(tmpl.kind).toBe(ROOM_MEMBERS)
    expect(tmpl.tags.filter(t => t[0] === "d").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["d", "room1"])
    expect(tmpl.tags).toContainEqual(["p", a])
    expect(tmpl.tags).toContainEqual(["p", b])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder and edits membership", async () => {
    const builder = new RoomMembersBuilder()
    builder.setIdentifier("room2")

    const tmpl = await builder
      .addMember(a)
      .addMember(a) // dedup
      .addMember(b)
      .removeMember(b)
      .toTemplate(signer)

    expect(tmpl.tags).toContainEqual(["d", "room2"])
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["p", a])
    expect(tmpl.tags).not.toContainEqual(["p", b])
  })

  it("throws on the wrong kind", async () => {
    await expect(RoomMembers.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
