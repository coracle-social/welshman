import {describe, it, expect} from "vitest"
import {PIN, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Pin} from "../src/kinds/Pin"

const pubkey = "ee".repeat(32)

const board = `30067:${pubkey}:japan-trip-2024`
const board2 = `30067:${pubkey}:best-photos-2024`
const eventId = "11".repeat(32)
const address = `30023:${"22".repeat(32)}:tokyo-guide`
const relay = "wss://relay.example.com"

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: PIN,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("Pin", () => {
  it("reads boards and an event reference", async () => {
    const reader = await Pin.read(
      makeEvent({
        content: "Sunrise at Mt. Fuji",
        tags: [
          ["A", board],
          ["e", eventId, relay],
        ],
      }),
    )

    expect(reader.boards()).toEqual([board])
    expect(reader.isProfilePin()).toBe(false)
    expect(reader.reference()).toEqual({type: "event", id: eventId, relay})
    expect(reader.content()).toBe("Sunrise at Mt. Fuji")
  })

  it("reads an address reference", async () => {
    const reader = await Pin.read(
      makeEvent({
        tags: [
          ["A", board],
          ["a", address, relay],
        ],
      }),
    )

    expect(reader.reference()).toEqual({type: "address", address, relay})
  })

  it("reads an external reference with its kind", async () => {
    const reader = await Pin.read(
      makeEvent({
        tags: [
          ["A", board],
          ["i", "isbn:9784805311981"],
          ["k", "isbn"],
          ["title", "Japan Travel Guide"],
        ],
      }),
    )

    expect(reader.reference()).toEqual({type: "external", id: "isbn:9784805311981", kind: "isbn"})
    expect(reader.title()).toBe("Japan Travel Guide")
  })

  it("treats a pin with no board as a profile pin", async () => {
    const reader = await Pin.read(
      makeEvent({
        tags: [
          ["e", eventId],
          ["t", "photography"],
        ],
      }),
    )

    expect(reader.boards()).toEqual([])
    expect(reader.isProfilePin()).toBe(true)
    expect(reader.topics()).toEqual(["photography"])
  })

  it("builds a pin to multiple boards", async () => {
    const tmpl = await Pin.builder()
      .setIdentifier("id1")
      .addBoard(board)
      .addBoard(board2)
      .setEvent(eventId)
      .toTemplate()

    expect(tmpl.kind).toBe(PIN)
    expect(tmpl.tags.filter(t => t[0] === "A")).toEqual([
      ["A", board],
      ["A", board2],
    ])
    expect(tmpl.tags).toContainEqual(["e", eventId])
  })

  it("includes a relay hint when given", async () => {
    const tmpl = await Pin.builder().setIdentifier("id1").setEvent(eventId, relay).toTemplate()

    expect(tmpl.tags).toContainEqual(["e", eventId, relay])
  })

  it("references exactly one item — a new reference replaces the old", async () => {
    const tmpl = await Pin.builder()
      .setIdentifier("id1")
      .setEvent(eventId)
      .setExternal("isbn:9784805311981", "isbn")
      .toTemplate()

    expect(tmpl.tags.some(t => t[0] === "e")).toBe(false)
    expect(tmpl.tags).toContainEqual(["i", "isbn:9784805311981"])
    expect(tmpl.tags).toContainEqual(["k", "isbn"])
  })

  it("removeBoard drops only the matching board", async () => {
    const tmpl = await Pin.builder()
      .setIdentifier("id1")
      .addBoard(board)
      .addBoard(board2)
      .setEvent(eventId)
      .removeBoard(board)
      .toTemplate()

    expect(tmpl.tags.filter(t => t[0] === "A")).toEqual([["A", board2]])
  })

  it("round-trips an existing pin without duplicating tags", async () => {
    const reader = await Pin.read(
      makeEvent({
        content: "comment",
        tags: [
          ["d", "id1"],
          ["A", board],
          ["e", eventId, relay],
          ["title", "My Pin"],
          ["zzz", "x"],
        ],
      }),
    )

    const tmpl = await Pin.builder(reader).toTemplate()

    expect(tmpl.tags.filter(t => t[0] === "d")).toEqual([["d", "id1"]])
    expect(tmpl.tags.filter(t => t[0] === "A")).toEqual([["A", board]])
    expect(tmpl.tags.filter(t => t[0] === "e")).toEqual([["e", eventId, relay]])
    expect(tmpl.tags).toContainEqual(["title", "My Pin"])
    expect(tmpl.tags).toContainEqual(["zzz", "x"])
    expect(tmpl.content).toBe("comment")
  })

  it("requires a content reference", async () => {
    await expect(
      Pin.builder().setIdentifier("id1").addBoard(board).toTemplate(),
    ).rejects.toThrow(/reference/)
  })

  it("requires a d tag", async () => {
    await expect(Pin.builder().setEvent(eventId).toTemplate()).rejects.toThrow(/d tag/)
  })

  it("throws on the wrong kind", async () => {
    await expect(Pin.read(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
