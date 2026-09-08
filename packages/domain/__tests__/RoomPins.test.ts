import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_PINS, relay} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomPins} from "../src/kinds/RoomPins"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const a = "aa".repeat(32)
const b = "bb".repeat(32)
const c = "cc".repeat(32)
const address = `30023:${pubkey}:my-article`
const otherAddress = `30023:${pubkey}:other-article`

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOM_PINS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomPins", () => {
  it("reads represented tags", async () => {
    const pins = await read(
      RoomPins,
      makeEvent({
        tags: [
          ["d", "room1"],
          ["e", a],
          ["a", address],
          ["e", b],
          ["alt", "x"],
        ],
      }),
    )

    expect(pins.identifier()).toBe("room1")
    expect(pins.ids()).toEqual([a, b])
    expect(pins.addresses()).toEqual([address])
    expect(pins.isPinned(a)).toBe(true)
    expect(pins.isPinned(address)).toBe(true)
    expect(pins.isPinned(c)).toBe(false)
  })

  it("keeps ids and addresses interleaved in tag order", async () => {
    const pins = await read(
      RoomPins,
      makeEvent({
        tags: [
          ["d", "room1"],
          ["e", a],
          ["a", address],
          ["e", b],
          ["a", otherAddress],
        ],
      }),
    )

    expect(pins.pins()).toEqual([a, address, b, otherAddress])
  })

  it("ignores malformed pin tags", async () => {
    const pins = await read(
      RoomPins,
      makeEvent({
        tags: [
          ["d", "room1"],
          ["e", "not-hex"],
          ["a", "not-an-address"],
          ["e", a],
        ],
      }),
    )

    expect(pins.pins()).toEqual([a])
  })

  it("round-trips with no duplicated tags", async () => {
    const pins = await read(
      RoomPins,
      makeEvent({
        tags: [
          ["d", "room1"],
          ["e", a],
          ["a", address],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(
      write(RoomPins, pins).forceRoutes(relay("wss://relay.example.com/")),
      signer,
    )

    expect(tmpl.kind).toBe(ROOM_PINS)
    expect(tmpl.tags.filter(t => t[0] === "d").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["e", a])
    expect(tmpl.tags).toContainEqual(["a", address])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("routes each value to the tag its type calls for, replacing the whole list", async () => {
    const builder = write(RoomPins)
    builder.setIdentifier("room2")

    const tmpl = await buildTemplate(
      builder
        .setPins([a, address])
        .setPins([b, otherAddress, b]) // replaces, and dedups
        .forceRoutes(relay("wss://relay.example.com/")),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["d", "room2"])
    expect(tmpl.tags.filter(t => t[0] === "e")).toEqual([["e", b]])
    expect(tmpl.tags.filter(t => t[0] === "a")).toEqual([["a", otherAddress]])
  })
})
