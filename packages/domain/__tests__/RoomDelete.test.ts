import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_DELETE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomDelete, RoomDeleteBuilder} from "../src/kinds/RoomDelete"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const group = "room1"

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
  it("reads the target room via group()", async () => {
    const del = await RoomDelete.fromEvent(makeEvent({tags: [["h", group]]}))

    expect(del.group()).toBe(group)
  })

  it("round-trips the group behavior tag without duplication", async () => {
    const del = await RoomDelete.fromEvent(makeEvent({tags: [["h", group], ["alt", "x"]]}))

    const tmpl = await del.builder().toTemplate(signer)

    expect(tmpl.kind).toBe(ROOM_DELETE)
    expect(tmpl.tags.filter(t => t[0] === "h").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["h", group])
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("sets the target room via a fresh builder", async () => {
    const tmpl = await new RoomDeleteBuilder().setGroup(group).toTemplate(signer)

    expect(tmpl.tags).toContainEqual(["h", group])
  })

  it("requires an h group", async () => {
    await expect(new RoomDeleteBuilder().toTemplate(signer)).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(RoomDelete.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
