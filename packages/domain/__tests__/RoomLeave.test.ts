import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_LEAVE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomLeave} from "../src/kinds/RoomLeave"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const group = "abcd1234"

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOM_LEAVE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomLeave", () => {
  it("reads the group via group()", async () => {
    const leave = await read(RoomLeave, makeEvent({tags: [["h", group]]}))

    expect(leave.group()).toBe(group)
  })

  it("round-trips the group behavior tag without duplication", async () => {
    const leave = await read(RoomLeave, 
      makeEvent({
        tags: [
          ["h", group],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(write(RoomLeave, leave)
      .setGroup("wss://relay.example.com/", group), signer)

    expect(tmpl.kind).toBe(ROOM_LEAVE)
    expect(tmpl.tags.filter(t => t[0] === "h").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["h", group])
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("sets the group via a fresh builder", async () => {
    const tmpl = await buildTemplate(write(RoomLeave).setGroup("wss://relay.example.com/", group), signer)

    expect(tmpl.tags).toContainEqual(["h", group])
  })

  it("requires an h identifier", async () => {
    await expect(buildTemplate(write(RoomLeave), signer)).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RoomLeave, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
