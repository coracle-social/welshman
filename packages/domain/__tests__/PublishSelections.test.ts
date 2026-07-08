import {describe, it, expect} from "vitest"
import {FOLLOWS, MUTES, NOTE, REACTION, DELETE} from "@welshman/util"
import type {RelayRoute, TrustedEvent} from "@welshman/util"
import {ContentRouter, IndexedRouter, OutboxRouter} from "../src/EventRouter"
import {FollowList} from "../src/kinds/FollowList"
import {DeleteRouter} from "../src/kinds/Delete"
import {RoomCreate} from "../src/kinds/RoomCreate"

const author = "ee".repeat(32)
const a = "aa".repeat(32)
const b = "bb".repeat(32)
const HINT = "wss://hint.example.com/"

const makeEvent = (o: Partial<TrustedEvent>): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey: author,
    created_at: 0,
    kind: NOTE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

// Collapse the routes to a comparable summary.
const summarize = (routes: {route: RelayRoute}[]) =>
  routes.map(({route}) => {
    switch (route.type) {
      case "pubkeyInbox":
        return `read:${route.pubkey}`
      case "pubkeyOutbox":
        return `write:${route.pubkey}`
      case "pubkeyMessaging":
        return `messaging:${route.pubkey}`
      case "relay":
        return `relay:${route.url}`
      case "seen":
        return `seen:${route.ref.id}`
      default:
        return route.type
    }
  })

describe("EventRouter", () => {
  it("ContentRouter routes to author outbox + mention inboxes, ignoring tag relay hints", async () => {
    const routes = await new ContentRouter(
      makeEvent({kind: REACTION, tags: [["p", a], ["e", "id", HINT]]}),
    ).routes()

    const summary = summarize(routes)

    expect(summary).toContain(`write:${author}`) // author outbox
    expect(summary).toContain(`read:${a}`) // mentioned pubkey inbox
    // A tag's relay hint is a read-side breadcrumb (where to find the referenced
    // event), not a publish target for this event.
    expect(summary).not.toContain(`relay:${HINT}`)
  })

  it("IndexedRouter routes to author outbox + indexers, never p-tag inboxes", async () => {
    const routes = await new IndexedRouter(
      makeEvent({kind: FOLLOWS, tags: [["p", a], ["p", b]]}),
    ).routes()

    const summary = summarize(routes)

    // Only the author's outbox and indexers — never the followees' inboxes.
    expect(summary).toContain(`write:${author}`)
    expect(summary).toContain("index")
    expect(summary).not.toContain(`read:${a}`)
    expect(summary).not.toContain(`read:${b}`)
  })

  it("OutboxRouter routes to the author outbox only", async () => {
    const routes = await new OutboxRouter(makeEvent({kind: MUTES, tags: [["p", a]]})).routes()

    expect(summarize(routes)).toEqual([`write:${author}`])
  })

  it("DeleteRouter adds the deleted events' seen relays", async () => {
    const deletedId = "12".repeat(32)
    const routes = await new DeleteRouter(
      makeEvent({kind: DELETE, tags: [["e", deletedId], ["k", "1"]]}),
    ).routes()

    const summary = summarize(routes)

    expect(summary).toContain(`write:${author}`)
    expect(summary).toContain(`seen:${deletedId}`)
  })

  it("uses userOutbox when routing a not-yet-signed builder", async () => {
    const builder = FollowList.builder().addTags(["p", a])
    const routes = await builder.routes()

    // No signed author yet -> userOutbox (resolved against the current user).
    expect(routes.some(r => r.route.type === "userOutbox")).toBe(true)
    expect(summarize(routes)).toContain("index")
    expect(summarize(routes)).not.toContain(`read:${a}`)
  })

  it("a NIP-29 group publish routes only to the group relay", async () => {
    const url = "wss://groups.example.com/"
    const routes = await RoomCreate.builder().setGroup(url, "mygroup").routes()

    // setGroup records the relay; the router short-circuits to it, dropping the
    // author outbox it would otherwise use.
    expect(summarize(routes)).toEqual([`relay:${url}`])
  })
})
