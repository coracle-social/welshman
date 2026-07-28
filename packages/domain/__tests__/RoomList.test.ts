import {describe, it, expect} from "vitest"
import {makeSecret, ROOMS, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomList} from "../src/kinds/RoomList"
import {buildTemplate, buildEvent, read, write, publishRelays, markerResolver} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const relayA = "wss://rooms.example.com/"
const relayB = "wss://other.example.com/"
const roomA = "rooma"
const roomB = "roomb"

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOMS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("RoomList", () => {
  it("reads joined rooms", async () => {
    const reader = await read(
      RoomList,
      makeEvent({
        tags: [
          ["group", roomA, relayA],
          ["alt", "x"],
        ],
      }),
    )

    expect(reader.rooms()).toEqual([roomA])
    expect(reader.roomTags()).toEqual([["group", roomA, relayA]])
  })

  it("reads relays and urls from r tags and room relay hints", async () => {
    const reader = await read(
      RoomList,
      makeEvent({
        tags: [
          ["r", relayA],
          ["group", roomA, relayA],
          ["group", roomB, "other.example.com"],
        ],
      }),
    )

    expect(reader.relays()).toEqual([relayA])
    expect(reader.urls()).toEqual([relayA, relayB])
  })

  it("reads rooms scoped to a url", async () => {
    const reader = await read(
      RoomList,
      makeEvent({
        tags: [
          ["group", roomA, relayA],
          ["group", roomB, "other.example.com"],
        ],
      }),
    )

    expect(reader.roomsForUrl(relayA)).toEqual([roomA])
    expect(reader.roomsForUrl(relayB)).toEqual([roomB])
  })

  it("round-trips without duplicating represented tags", async () => {
    const reader = await read(
      RoomList,
      makeEvent({
        tags: [
          ["group", roomA, relayA],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(write(RoomList, reader), signer)

    expect(tmpl.tags.filter(t => t[0] === "group").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("joins and leaves rooms via a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(RoomList).addRoom(roomA, relayA).addRoom(roomB, relayA).removeRoom(roomA),
      signer,
    )

    expect(tmpl.kind).toBe(ROOMS)
    expect(tmpl.tags).toContainEqual(["group", roomB, relayA])
    expect(tmpl.tags.some(t => t[1] === roomA)).toBe(false)
  })

  it("leaves rooms scoped to a url", async () => {
    const tmpl = await buildTemplate(
      write(RoomList)
        .addRoom(roomA, relayA)
        .addRoom(roomA, relayB)
        .removeRoom(roomA, "other.example.com"),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["group", roomA, relayA])
    expect(tmpl.tags).not.toContainEqual(["group", roomA, relayB])
  })

  it("adds relays without duplicating normalized urls", async () => {
    const tmpl = await buildTemplate(
      write(RoomList).addRelay(relayA).addRelay("rooms.example.com").addRelay(relayB),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "r")).toEqual([
      ["r", relayA],
      ["r", relayB],
    ])
  })

  it("removes relays along with their room tags", async () => {
    const tmpl = await buildTemplate(
      write(RoomList)
        .addRelay(relayA)
        .addRelay(relayB)
        .addRoom(roomA, relayA)
        .addRoom(roomB, relayB)
        .removeRelay("rooms.example.com"),
      signer,
    )

    expect(tmpl.tags).toEqual([
      ["r", relayB],
      ["group", roomB, relayB],
    ])
  })

  it("round-trips public and private rooms through encryption", async () => {
    const event = await buildEvent(
      write(RoomList).addRoom(roomA, relayA).addPrivate(["group", roomB, relayA]),
      signer,
    )

    const decrypted = await read(RoomList, event, signer)

    expect(decrypted.decrypted).toBe(true)
    expect(decrypted.rooms().sort()).toEqual([roomA, roomB].sort())

    const publicOnly = await read(RoomList, event)

    expect(publicOnly.decrypted).toBe(false)
    expect(publicOnly.rooms()).toEqual([roomA])
  })

  it("routes to both original and current relays so dropped relays are notified", async () => {
    const reader = await read(
      RoomList,
      makeEvent({
        tags: [
          ["r", relayA],
          ["group", roomB, relayB],
        ],
      }),
    )

    // Drop relayA (and its rooms); relayB stays via its room hint.
    const writer = write(RoomList, reader, markerResolver).removeRelay(relayA)
    const urls = await publishRelays(writer)

    // relayA is gone from the event but still routed to (from the originals),
    // relayB is routed to (from the current urls).
    expect(urls).toContain(relayA)
    expect(urls).toContain(relayB)
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RoomList, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
