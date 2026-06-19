import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_DELETE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomDelete, RoomDeleteBuilder} from "../src/kinds/RoomDelete"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOM_DELETE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomDelete", () => {
  it("reads multiple repeatable h tags", async () => {
    const del = await RoomDelete.fromEvent(
      makeEvent({tags: [["h", "room1"], ["h", "room2"], ["h", "room3"], ["alt", "x"]]}),
    )

    expect(del.hs()).toEqual(["room1", "room2", "room3"])
    expect(del.h()).toBe("room1")
  })

  it("round-trips multiple rooms, emitting one h each with no duplication", async () => {
    const del = await RoomDelete.fromEvent(
      makeEvent({tags: [["h", "room1"], ["h", "room2"], ["h", "room3"], ["alt", "x"]]}),
    )

    const tmpl = await del.builder().toTemplate(signer)

    expect(tmpl.kind).toBe(ROOM_DELETE)
    // Three rooms in, three h tags out — exactly one per room, no duplicates.
    expect(tmpl.tags.filter(t => t[0] === "h").length).toBe(3)
    expect(tmpl.tags).toContainEqual(["h", "room1"])
    expect(tmpl.tags).toContainEqual(["h", "room2"])
    expect(tmpl.tags).toContainEqual(["h", "room3"])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder and edits the room set", async () => {
    const tmpl = await new RoomDeleteBuilder()
      .addRoom("room1")
      .addRoom("room1") // dedup
      .addRoom("room2")
      .removeRoom("room1")
      .toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "h").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["h", "room2"])
    expect(tmpl.tags).not.toContainEqual(["h", "room1"])
  })

  it("requires at least one h tag", async () => {
    await expect(new RoomDeleteBuilder().toTemplate(signer)).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(RoomDelete.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
