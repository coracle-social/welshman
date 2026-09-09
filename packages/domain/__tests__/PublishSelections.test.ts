import {describe, it, expect} from "vitest"
import {NOTE, relay} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Note} from "../src/kinds/Note"
import {Delete} from "../src/kinds/Delete"
import {RoomCreate} from "../src/kinds/RoomCreate"
import {write, publishRelays, markerResolver, OUTBOX, INBOX, SEEN} from "./helpers.js"

const a = "aa".repeat(32)

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey: "ee".repeat(32),
    created_at: 0,
    kind: NOTE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

// `markerResolver` maps each route type to a recognizable url, so the resolved
// publish relays reveal which sources a writer targets.
describe("writer routing", () => {
  it("the default reaches the author outbox + the inboxes of referenced pubkeys", async () => {
    const relays = await publishRelays(write(Note, undefined, markerResolver).addTags(["p", a]))

    expect(relays).toContain(OUTBOX)
    expect(relays).toContain(INBOX)
  })

  it("with no referenced pubkeys, reaches only the author outbox", async () => {
    const relays = await publishRelays(write(Note, undefined, markerResolver))

    expect(relays).toEqual([OUTBOX])
  })

  it("a delete also reaches where the deleted events were seen", async () => {
    const deleted = makeEvent({id: "12".repeat(32)})
    const relays = await publishRelays(write(Delete, undefined, markerResolver).addEvent(deleted))

    expect(relays).toContain(OUTBOX)
    expect(relays).toContain(SEEN)
  })

  it("a NIP-29 room publish routes only to the room relay", async () => {
    const url = "wss://rooms.example.com/"
    const relays = await publishRelays(
      write(RoomCreate, undefined, markerResolver).setRoom(url, "x"),
    )

    expect(relays).toEqual([url])
  })

  it("a room publish reaches a self-hosted relay the outbox model would skip", async () => {
    const url = "ws://localhost:3334/"
    const relays = await publishRelays(
      write(RoomCreate, undefined, markerResolver).setRoom(url, "x"),
    )

    expect(relays).toEqual([url])
  })

  it("forced routes are all published to, past the limit a scored scenario applies", async () => {
    const urls = [
      "wss://a.example.com/",
      "wss://b.example.com/",
      "wss://c.example.com/",
      "wss://d.example.com/",
    ]
    const relays = await publishRelays(
      write(Note, undefined, markerResolver).forceRoutes(...urls.map(url => relay(url))),
    )

    expect(relays.sort()).toEqual(urls)
  })
})
