import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_UPDATE_PINS, relay} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomUpdatePins} from "../src/kinds/RoomUpdatePins"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const a = "aa".repeat(32)
const b = "bb".repeat(32)
const address = `30023:${pubkey}:my-article`

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOM_UPDATE_PINS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomUpdatePins", () => {
  it("reads represented tags", async () => {
    const op = await read(
      RoomUpdatePins,
      makeEvent({
        tags: [
          ["h", "room1"],
          ["e", a],
          ["a", address],
          ["e", b],
        ],
      }),
    )

    expect(op.room()).toBe("room1")
    expect(op.pins()).toEqual([a, address, b])
    expect(op.ids()).toEqual([a, b])
    expect(op.addresses()).toEqual([address])
  })

  it("builds an op carrying the full list", async () => {
    const tmpl = await buildTemplate(
      write(RoomUpdatePins)
        .setRoom("wss://relay.example.com/", "room2")
        .setPins([a, address])
        .forceRoutes(relay("wss://relay.example.com/")),
      signer,
    )

    expect(tmpl.kind).toBe(ROOM_UPDATE_PINS)
    expect(tmpl.tags).toContainEqual(["h", "room2"])
    expect(tmpl.tags).toContainEqual(["e", a])
    expect(tmpl.tags).toContainEqual(["a", address])
  })

  it("requires a room", async () => {
    await expect(
      buildTemplate(
        write(RoomUpdatePins).setPins([a]).forceRoutes(relay("wss://relay.example.com/")),
      ),
    ).rejects.toThrow("RoomUpdatePins requires a room")
  })
})
