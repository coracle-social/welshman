import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_ADMINS, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomAdmins, RoomAdminsBuilder} from "../src/kinds/RoomAdmins"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const a = "aa".repeat(32)
const b = "bb".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOM_ADMINS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomAdmins", () => {
  it("reads represented tags", async () => {
    const room = await RoomAdmins.fromEvent(
      makeEvent({tags: [["d", "room1"], ["p", a], ["p", b], ["alt", "x"]]}),
    )

    expect(room.h()).toBe("room1")
    expect(room.identifier()).toBe("room1")
    expect(room.pubkeys()).toEqual([a, b])
  })

  it("round-trips with no duplicated tags", async () => {
    const room = await RoomAdmins.fromEvent(
      makeEvent({tags: [["d", "room1"], ["p", a], ["p", b], ["alt", "x"]]}),
    )

    const tmpl = await room.builder().toTemplate(signer)

    expect(tmpl.kind).toBe(ROOM_ADMINS)
    expect(tmpl.tags.filter(t => t[0] === "d").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["d", "room1"])
    expect(tmpl.tags).toContainEqual(["p", a])
    expect(tmpl.tags).toContainEqual(["p", b])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await new RoomAdminsBuilder()
      .setH("room2")
      .addPubkey(a)
      .addPubkey(a) // dedup
      .addPubkey(b)
      .toTemplate(signer)

    expect(tmpl.tags).toContainEqual(["d", "room2"])
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["p", a])
    expect(tmpl.tags).toContainEqual(["p", b])
  })

  it("throws on the wrong kind", async () => {
    await expect(RoomAdmins.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
