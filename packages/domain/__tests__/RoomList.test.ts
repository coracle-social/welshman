import {describe, it, expect} from "vitest"
import {makeSecret, ROOMS, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomList, RoomListBuilder} from "../src/kinds/RoomList"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const relay = "wss://groups.example.com/"
const groupA = "groupa"
const groupB = "groupb"

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
  it("reads joined groups", async () => {
    const reader = await RoomList.fromEvent(
      makeEvent({tags: [["group", groupA, relay], ["alt", "x"]]}),
    )

    expect(reader.groups()).toEqual([groupA])
    expect(reader.groupTags()).toEqual([["group", groupA, relay]])
  })

  it("round-trips without duplicating represented tags", async () => {
    const reader = await RoomList.fromEvent(
      makeEvent({tags: [["group", groupA, relay], ["alt", "x"]]}),
    )

    const tmpl = await reader.builder().toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "group").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("joins and leaves groups via a fresh builder", async () => {
    const tmpl = await new RoomListBuilder()
      .join(groupA, relay)
      .join(groupB, relay)
      .leave(groupA)
      .toTemplate(signer)

    expect(tmpl.kind).toBe(ROOMS)
    expect(tmpl.tags).toContainEqual(["group", groupB, relay])
    expect(tmpl.tags.some(t => t[1] === groupA)).toBe(false)
  })

  it("round-trips public and private groups through encryption", async () => {
    const event = await new RoomListBuilder()
      .join(groupA, relay)
      .addPrivate(["group", groupB, relay])
      .toEvent(signer)

    const decrypted = await RoomList.fromEvent(event, signer)

    expect(decrypted.decrypted).toBe(true)
    expect(decrypted.groups().sort()).toEqual([groupA, groupB].sort())

    const publicOnly = await RoomList.fromEvent(event)

    expect(publicOnly.decrypted).toBe(false)
    expect(publicOnly.groups()).toEqual([groupA])
  })

  it("throws on the wrong kind", async () => {
    await expect(RoomList.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
