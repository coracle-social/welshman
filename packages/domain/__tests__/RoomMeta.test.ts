import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_META, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomMeta} from "../src/kinds/RoomMeta"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOM_META,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomMeta", () => {
  it("reads represented tags", async () => {
    const room = await RoomMeta.read(
      makeEvent({
        tags: [
          ["d", "room1"],
          ["name", "My Room"],
          ["about", "a place"],
          ["picture", "https://img", "256x256"],
          ["closed"],
          ["private"],
          ["livekit"],
          ["alt", "x"],
        ],
      }),
    )

    expect(room.identifier()).toBe("room1")
    expect(room.name()).toBe("My Room")
    expect(room.about()).toBe("a place")
    expect(room.picture()).toBe("https://img")
    expect(room.pictureMeta()).toEqual(["256x256"])
    expect(room.isClosed()).toBe(true)
    expect(room.isHidden()).toBe(false)
    expect(room.isPrivate()).toBe(true)
    expect(room.isRestricted()).toBe(false)
    expect(room.hasLivekit()).toBe(true)
  })

  it("round-trips with no duplicated tags", async () => {
    const room = await RoomMeta.read(
      makeEvent({
        tags: [
          ["d", "room1"],
          ["name", "My Room"],
          ["about", "a place"],
          ["picture", "https://img", "256x256"],
          ["closed"],
          ["private"],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await RoomMeta.builder(room).toTemplate(signer)

    expect(tmpl.kind).toBe(ROOM_META)
    expect(tmpl.tags.filter(t => t[0] === "d").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "name").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "about").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "picture").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "closed").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "private").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["d", "room1"])
    expect(tmpl.tags).toContainEqual(["name", "My Room"])
    expect(tmpl.tags).toContainEqual(["picture", "https://img", "256x256"])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await RoomMeta.builder()
      .setIdentifier("room2")
      .setName("Fresh")
      .setAbout("desc")
      .setPicture("https://pic", ["100x100"])
      .toTemplate(signer)

    expect(tmpl.tags).toContainEqual(["name", "Fresh"])
    expect(tmpl.tags).toContainEqual(["about", "desc"])
    expect(tmpl.tags).toContainEqual(["picture", "https://pic", "100x100"])
    expect(tmpl.tags).toContainEqual(["d", "room2"])
  })

  it("throws on the wrong kind", async () => {
    await expect(RoomMeta.read(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
