import {describe, it, expect} from "vitest"
import {makeSecret, ROOMS, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomList, RoomListBuilder} from "../src/kinds/RoomList"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const relayA = "wss://groups.example.com/"
const relayB = "wss://other.example.com/"
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
      makeEvent({
        tags: [
          ["group", groupA, relayA],
          ["alt", "x"],
        ],
      }),
    )

    expect(reader.groups()).toEqual([groupA])
    expect(reader.groupTags()).toEqual([["group", groupA, relayA]])
  })

  it("reads relays and urls from r tags and group relay hints", async () => {
    const reader = await RoomList.fromEvent(
      makeEvent({
        tags: [
          ["r", relayA],
          ["group", groupA, relayA],
          ["group", groupB, "other.example.com"],
        ],
      }),
    )

    expect(reader.relays()).toEqual([relayA])
    expect(reader.urls()).toEqual([relayA, relayB])
  })

  it("reads groups scoped to a url", async () => {
    const reader = await RoomList.fromEvent(
      makeEvent({
        tags: [
          ["group", groupA, relayA],
          ["group", groupB, "other.example.com"],
        ],
      }),
    )

    expect(reader.groupsForUrl(relayA)).toEqual([groupA])
    expect(reader.groupsForUrl(relayB)).toEqual([groupB])
  })

  it("round-trips without duplicating represented tags", async () => {
    const reader = await RoomList.fromEvent(
      makeEvent({
        tags: [
          ["group", groupA, relayA],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await reader.builder().toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "group").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("joins and leaves groups via a fresh builder", async () => {
    const tmpl = await new RoomListBuilder()
      .addGroup(groupA, relayA)
      .addGroup(groupB, relayA)
      .removeGroup(groupA)
      .toTemplate(signer)

    expect(tmpl.kind).toBe(ROOMS)
    expect(tmpl.tags).toContainEqual(["group", groupB, relayA])
    expect(tmpl.tags.some(t => t[1] === groupA)).toBe(false)
  })

  it("leaves groups scoped to a url", async () => {
    const tmpl = await new RoomListBuilder()
      .addGroup(groupA, relayA)
      .addGroup(groupA, relayB)
      .removeGroup(groupA, "other.example.com")
      .toTemplate(signer)

    expect(tmpl.tags).toContainEqual(["group", groupA, relayA])
    expect(tmpl.tags).not.toContainEqual(["group", groupA, relayB])
  })

  it("adds relays without duplicating normalized urls", async () => {
    const tmpl = await new RoomListBuilder()
      .addRelay(relayA)
      .addRelay("groups.example.com")
      .addRelay(relayB)
      .toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "r")).toEqual([
      ["r", relayA],
      ["r", relayB],
    ])
  })

  it("removes relays along with their group tags", async () => {
    const tmpl = await new RoomListBuilder()
      .addRelay(relayA)
      .addRelay(relayB)
      .addGroup(groupA, relayA)
      .addGroup(groupB, relayB)
      .removeRelay("groups.example.com")
      .toTemplate(signer)

    expect(tmpl.tags).toEqual([
      ["r", relayB],
      ["group", groupB, relayB],
    ])
  })

  it("sets relays preserving order and existing tag extras", async () => {
    const reader = await RoomList.fromEvent(
      makeEvent({
        tags: [
          ["r", relayA, "extra"],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await reader.builder().setRelays([relayB, "groups.example.com"]).toTemplate(signer)

    expect(tmpl.tags).toEqual([
      ["r", relayB],
      ["r", relayA, "extra"],
      ["alt", "x"],
    ])
  })

  it("round-trips public and private groups through encryption", async () => {
    const event = await new RoomListBuilder()
      .addGroup(groupA, relayA)
      .addPrivate(["group", groupB, relayA])
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
