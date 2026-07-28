import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_CREATE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomCreate} from "../src/kinds/RoomCreate"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const room = "abcd1234"

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOM_CREATE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomCreate", () => {
  it("round-trips the room behavior tag without duplication", async () => {
    const create = await read(
      RoomCreate,
      makeEvent({
        tags: [
          ["h", room],
          ["alt", "x"],
        ],
      }),
    )

    expect(create.room()).toBe(room)

    const tmpl = await buildTemplate(
      write(RoomCreate, create).setRoom("wss://relay.example.com/", room),
      signer,
    )

    expect(tmpl.kind).toBe(ROOM_CREATE)
    expect(tmpl.tags.filter(t => t[0] === "h").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["h", room])
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("sets the room via a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(RoomCreate).setRoom("wss://relay.example.com/", room),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["h", room])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RoomCreate, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
