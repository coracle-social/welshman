import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_DELETE, ROOM_DELETE_EVENT, relay, tagSpec, tagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomDeleteEvent} from "../src/kinds/RoomDeleteEvent"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const a = "aa".repeat(32)
const b = "bb".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOM_DELETE_EVENT,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomDeleteEvent", () => {
  it("reads the room and the targeted ids", async () => {
    const op = await read(
      RoomDeleteEvent,
      makeEvent({
        tags: [
          ["h", "room1"],
          ["e", a],
          ["e", b],
        ],
      }),
    )

    expect(op.kind).toBe(ROOM_DELETE_EVENT)
    expect(op.room()).toBe("room1")
    expect(op.ids()).toEqual([a, b])
  })

  it("builds an op naming one event", async () => {
    const tmpl = await buildTemplate(
      write(RoomDeleteEvent).setRoom("wss://relay.example.com/", "room2").addId(a),
      signer,
    )

    expect(tmpl.kind).toBe(ROOM_DELETE_EVENT)
    expect(tagValue(tagSpec("h"), tmpl.tags)).toBe("room2")
    expect(tmpl.tags).toContainEqual(["e", a])
  })

  it("keeps one tag per id", async () => {
    const tmpl = await buildTemplate(
      write(RoomDeleteEvent)
        .setRoom("wss://relay.example.com/", "room2")
        .addId(a)
        .addId(a)
        .setIds([a, b, a]),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "e")).toEqual([
      ["e", a],
      ["e", b],
    ])
  })

  it("refuses to build without a room", async () => {
    await expect(
      buildTemplate(
        write(RoomDeleteEvent).addId(a).forceRoutes(relay("wss://relay.example.com/")),
        signer,
      ),
    ).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(
      read(RoomDeleteEvent, makeEvent({kind: ROOM_DELETE, tags: [["h", "room1"]]})),
    ).rejects.toThrow()
  })
})
