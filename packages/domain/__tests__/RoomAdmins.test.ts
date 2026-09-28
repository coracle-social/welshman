import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_ADMINS, NOTE, relay} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomAdmins} from "../src/kinds/RoomAdmins"
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
    kind: ROOM_ADMINS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomAdmins", () => {
  it("reads represented tags", async () => {
    const room = await read(
      RoomAdmins,
      makeEvent({
        tags: [
          ["d", "room1"],
          ["p", a],
          ["p", b],
          ["alt", "x"],
        ],
      }),
    )

    expect(room.identifier()).toBe("room1")
    expect(room.pubkeys()).toEqual([a, b])
  })

  it("round-trips with no duplicated tags", async () => {
    const room = await read(
      RoomAdmins,
      makeEvent({
        tags: [
          ["d", "room1"],
          ["p", a],
          ["p", b],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(
      write(RoomAdmins, room).forceRoutes(relay("wss://relay.example.com/")),
      signer,
    )

    expect(tmpl.kind).toBe(ROOM_ADMINS)
    expect(tmpl.tags.filter(t => t[0] === "d").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["d", "room1"])
    expect(tmpl.tags).toContainEqual(["p", a])
    expect(tmpl.tags).toContainEqual(["p", b])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(RoomAdmins)
        .setIdentifier("room2")
        .addPubkey(a)
        .addPubkey(a) // dedup
        .addPubkey(b)
        .forceRoutes(relay("wss://relay.example.com/")),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["d", "room2"])
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["p", a])
    expect(tmpl.tags).toContainEqual(["p", b])
  })

  it("reads each admin's roles", async () => {
    const room = await read(
      RoomAdmins,
      makeEvent({
        tags: [
          ["d", "room1"],
          ["p", a, "moderator", "editor"],
          ["p", b],
          ["p", a, "moderator", ""],
          ["p", "not-a-pubkey", "moderator"],
        ],
      }),
    )

    expect(room.rolesFor(a)).toEqual(["moderator", "editor"])
    expect(room.rolesFor(b)).toEqual([])
    expect(room.rolesFor("cc".repeat(32))).toEqual([])
    expect([...room.rolesByPubkey().entries()]).toEqual([
      [a, ["moderator", "editor"]],
      [b, []],
    ])
  })

  it("keeps existing roles when rewriting admins", async () => {
    const room = await read(
      RoomAdmins,
      makeEvent({
        tags: [
          ["d", "room1"],
          ["p", a, "moderator"],
          ["p", b, "editor"],
        ],
      }),
    )

    const tmpl = await buildTemplate(
      write(RoomAdmins, room)
        .addPubkey(a)
        .setPubkeys([a, b])
        .forceRoutes(relay("wss://relay.example.com/")),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "p")).toEqual([
      ["p", a, "moderator"],
      ["p", b, "editor"],
    ])
  })

  it("replaces roles when given", async () => {
    const room = await read(
      RoomAdmins,
      makeEvent({
        tags: [
          ["d", "room1"],
          ["p", a, "moderator"],
        ],
      }),
    )

    const tmpl = await buildTemplate(
      write(RoomAdmins, room)
        .addPubkey(a, ["editor", "moderator"])
        .addPubkey(b, ["editor"])
        .forceRoutes(relay("wss://relay.example.com/")),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "p")).toEqual([
      ["p", a, "editor", "moderator"],
      ["p", b, "editor"],
    ])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RoomAdmins, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
