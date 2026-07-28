import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_DELETE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomDelete} from "../src/kinds/RoomDelete"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const room = "room1"

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
  it("reads the target room via room()", async () => {
    const del = await read(RoomDelete, makeEvent({tags: [["h", room]]}))

    expect(del.room()).toBe(room)
  })

  it("round-trips the room behavior tag without duplication", async () => {
    const del = await read(
      RoomDelete,
      makeEvent({
        tags: [
          ["h", room],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(
      write(RoomDelete, del).setRoom("wss://relay.example.com/", room),
      signer,
    )

    expect(tmpl.kind).toBe(ROOM_DELETE)
    expect(tmpl.tags.filter(t => t[0] === "h").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["h", room])
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("sets the target room via a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(RoomDelete).setRoom("wss://relay.example.com/", room),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["h", room])
  })

  it("requires a room", async () => {
    await expect(buildTemplate(write(RoomDelete), signer)).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RoomDelete, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
