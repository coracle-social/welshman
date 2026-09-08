import {describe, it, expect} from "vitest"
import {NOTE, relay, userInbox} from "@welshman/util"
import {Note} from "../src/kinds/Note"
import {Profile} from "../src/kinds/Profile"
import {RoomMeta} from "../src/kinds/RoomMeta"
import {
  query,
  queryRelays,
  markerResolver,
  PUBKEY_OUTBOX,
  INBOX,
  INDEX,
  USER_INBOX,
} from "./helpers.js"

const a = "aa".repeat(32)
const b = "bb".repeat(32)
const id = "ff".repeat(32)

describe("EventQuery", () => {
  it("filters on the factory's kind", async () => {
    expect(await query(Note).renderFilters()).toEqual([{kinds: [NOTE]}])
  })

  it("sets, adds, removes, and clears list fields", async () => {
    const q = query(Note).setAuthors([a]).addAuthors([b, a])

    expect(await q.renderFilters()).toEqual([{kinds: [NOTE], authors: [a, b]}])

    q.removeAuthors([a]).setIds([id])

    expect(await q.renderFilters()).toEqual([{kinds: [NOTE], authors: [b], ids: [id]}])

    q.clearAuthors().clearIds()

    expect(await q.renderFilters()).toEqual([{kinds: [NOTE]}])
  })

  it("leaves a field unset when nothing is added, but keeps an explicitly empty one", async () => {
    expect(await query(Note).addIds([]).renderFilters()).toEqual([{kinds: [NOTE]}])
    expect(await query(Note).setIds([]).renderFilters()).toEqual([{kinds: [NOTE], ids: []}])
  })

  it("sets, adds, removes, and clears tag filters, with or without the # prefix", async () => {
    const q = query(Note).setTag("#e", [id]).addTag("e", [b]).setTag("p", [a, b])

    expect(await q.renderFilters()).toEqual([{kinds: [NOTE], "#e": [id, b], "#p": [a, b]}])

    q.removeTag("p", [a]).clearTag("e")

    expect(await q.renderFilters()).toEqual([{kinds: [NOTE], "#p": [b]}])

    q.clearTags()

    expect(await q.renderFilters()).toEqual([{kinds: [NOTE]}])
  })

  it("sets and clears scalar fields", async () => {
    const q = query(Note).setSince(1).setUntil(2).setLimit(3).setSearch("gm")

    expect(await q.renderFilters()).toEqual([
      {kinds: [NOTE], since: 1, until: 2, limit: 3, search: "gm"},
    ])

    q.clearSince().clearUntil().clearLimit().clearSearch()

    expect(await q.renderFilters()).toEqual([{kinds: [NOTE]}])
  })

  it("routes to the queried authors' outboxes and the mentioned pubkeys' inboxes", async () => {
    const relays = await queryRelays(query(Note, markerResolver).setAuthors([a]).setTag("p", [b]))

    expect(relays).toContain(PUBKEY_OUTBOX)
    expect(relays).toContain(INBOX)
  })

  it("routes nowhere on its own when there's nothing to route on — that's the caller's call", async () => {
    expect(await queryRelays(query(Note, markerResolver))).toEqual([])
    expect(await queryRelays(query(Note, markerResolver).addRoutes([userInbox()]))).toEqual([
      USER_INBOX,
    ])
  })

  it("replaces the routes with setRoutes and complements them with addRoutes", async () => {
    const url = "wss://explicit.example.com/"
    const other = "wss://other.example.com/"

    expect(
      await queryRelays(
        query(Note, markerResolver)
          .setAuthors([a])
          .setRoutes([relay(url)]),
      ),
    ).toEqual([url])

    const relays = await queryRelays(
      query(Note, markerResolver)
        .setAuthors([a])
        .addRoutes([relay(other)]),
    )

    expect(relays).toContain(PUBKEY_OUTBOX)
    expect(relays).toContain(other)
  })

  it("leaves routing to the kind — an indexed kind also asks the indexers", async () => {
    const relays = await queryRelays(query(Profile, markerResolver).setAuthors([a]))

    expect(relays).toContain(PUBKEY_OUTBOX)
    expect(relays).toContain(INDEX)
  })

  it("a kind that lives on one relay routes nowhere until it's given one", async () => {
    const url = "wss://rooms.example.com/"

    expect(await queryRelays(query(RoomMeta, markerResolver))).toEqual([])
    expect(await queryRelays(query(RoomMeta, markerResolver).setRoutes([relay(url)]))).toEqual([
      url,
    ])
  })

  it("scopes a room query to the room relay", async () => {
    const url = "wss://rooms.example.com/"
    const {filters, relays} = await query(Note, markerResolver).setRoom(url, "x").render()

    expect(filters).toEqual([{kinds: [NOTE], "#h": ["x"]}])
    expect(relays).toEqual([url])
  })
})
