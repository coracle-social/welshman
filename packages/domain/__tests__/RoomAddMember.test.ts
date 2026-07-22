import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_ADD_MEMBER, NOTE, tagSpec, tagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomAddMember} from "../src/kinds/RoomAddMember"
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
    kind: ROOM_ADD_MEMBER,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomAddMember", () => {
  it("reads pubkeys and group", async () => {
    const op = await read(
      RoomAddMember,
      makeEvent({
        tags: [
          ["h", "room1"],
          ["p", a],
          ["p", b],
          ["alt", "x"],
        ],
      }),
    )

    expect(op.kind).toBe(ROOM_ADD_MEMBER)
    expect(op.group()).toBe("room1")
    expect(op.pubkeys()).toEqual([a, b])
  })

  it("round-trips with no duplicated tags", async () => {
    const op = await read(
      RoomAddMember,
      makeEvent({
        tags: [
          ["h", "room1"],
          ["p", a],
          ["p", b],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(
      write(RoomAddMember, op).setGroup("wss://relay.example.com/", "room1"),
      signer,
    )

    expect(tmpl.kind).toBe(ROOM_ADD_MEMBER)
    // h round-trips via the base behavior tag.
    expect(tmpl.tags.filter(t => t[0] === "h").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
    expect(tagValue(tagSpec("h"), tmpl.tags)).toBe("room1")
    expect(tmpl.tags).toContainEqual(["p", a])
    expect(tmpl.tags).toContainEqual(["p", b])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(RoomAddMember)
        .setGroup("wss://relay.example.com/", "room2")
        .addPubkey(a)
        .addPubkey(a) // dedup
        .addPubkey(b),
      signer,
    )

    expect(tmpl.kind).toBe(ROOM_ADD_MEMBER)
    expect(tagValue(tagSpec("h"), tmpl.tags)).toBe("room2")
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["p", a])
    expect(tmpl.tags).toContainEqual(["p", b])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RoomAddMember, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
