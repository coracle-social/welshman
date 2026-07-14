import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_JOIN, NOTE, getTagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomJoin} from "../src/kinds/RoomJoin"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOM_JOIN,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomJoin", () => {
  it("reads represented fields", async () => {
    const join = await read(
      RoomJoin,
      makeEvent({
        tags: [
          ["h", "room1"],
          ["claim", "invite-code"],
          ["alt", "x"],
        ],
        content: "please let me in",
      }),
    )

    expect(join.group()).toBe("room1")
    expect(join.claim()).toBe("invite-code")
    expect(join.reason()).toBe("please let me in")
  })

  it("round-trips with no duplicated tags", async () => {
    const join = await read(
      RoomJoin,
      makeEvent({
        tags: [
          ["h", "room1"],
          ["claim", "invite-code"],
          ["alt", "x"],
        ],
        content: "please let me in",
      }),
    )

    const tmpl = await buildTemplate(
      write(RoomJoin, join).setGroup("wss://relay.example.com/", "room1"),
      signer,
    )

    expect(tmpl.kind).toBe(ROOM_JOIN)
    // h round-trips via the base behavior tag.
    expect(tmpl.tags.filter(t => t[0] === "h").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "claim").length).toBe(1)
    expect(getTagValue("h", tmpl.tags)).toBe("room1")
    expect(tmpl.tags).toContainEqual(["claim", "invite-code"])
    // Content (free-text reason) is preserved.
    expect(tmpl.content).toBe("please let me in")
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(RoomJoin)
        .setGroup("wss://relay.example.com/", "room2")
        .setClaim("xyz")
        .setReason("hi there"),
      signer,
    )

    expect(getTagValue("h", tmpl.tags)).toBe("room2")
    expect(tmpl.tags).toContainEqual(["claim", "xyz"])
    expect(tmpl.content).toBe("hi there")
  })

  it("requires an h/group", async () => {
    await expect(buildTemplate(write(RoomJoin).setClaim("xyz"), signer)).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RoomJoin, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
