import {describe, it, expect} from "vitest"
import {
  ROOM_MEMBERS,
  ROOM_ADMINS,
  ROOM_ADD_MEMBER,
  ROOM_REMOVE_MEMBER,
  ROOM_JOIN,
  ROOM_LEAVE,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Relay} from "@welshman/domain"
import {App} from "../src/app.js"
import {Relays} from "../src/plugins/relays.js"
import {Rooms, MembershipStatus} from "../src/plugins/rooms.js"

const URL = "wss://relay.example.com/"
const ROOM = "general"

const pk = (name: string) => name.repeat(64).slice(0, 64)

const RELAY = pk("f")
const ADMIN = pk("a")
const ALICE = pk("1")
const BOB = pk("2")
const MALLORY = pk("9")

let nextId = 0

// Room state (39000-39002) is relay-signed and keyed by `d`; ops carry `h`.
const makeEvent = (
  kind: number,
  author: string,
  createdAt: number,
  pubkeys: string[] = [],
): TrustedEvent =>
  ({
    id: `e${nextId++}`.padStart(64, "0"),
    pubkey: author,
    kind,
    created_at: createdAt,
    content: "",
    tags: [
      [kind === ROOM_MEMBERS || kind === ROOM_ADMINS ? "d" : "h", ROOM],
      ...pubkeys.map(p => ["p", p]),
    ],
    sig: "00".repeat(64),
  }) as TrustedEvent

// Seeds the relay profile the room-state self-check reads, then publishes each
// event and attributes it to the relay so it lands in the by-url index.
const makeApp = (events: TrustedEvent[]) => {
  const app = new App()

  app.use(Relays).set(URL, new Relay(URL, {self: RELAY}))

  for (const event of events) {
    app.repository.publish(event)
    app.tracker.track(event.id, URL)
  }

  return app
}

const membersOf = (events: TrustedEvent[]) =>
  Array.from(makeApp(events).use(Rooms).members(URL, ROOM).get()).sort()

const statusOf = (events: TrustedEvent[], pubkey: string) =>
  makeApp(events).use(Rooms).membershipStatus(URL, ROOM, pubkey).get()

describe("Rooms membership", () => {
  it("applies ops published after the snapshot", () => {
    expect(
      membersOf([
        makeEvent(ROOM_MEMBERS, RELAY, 100, [ALICE]),
        makeEvent(ROOM_ADD_MEMBER, ADMIN, 200, [BOB]),
        makeEvent(ROOM_ADMINS, RELAY, 50, [ADMIN]),
      ]),
    ).toEqual([ALICE, BOB].sort())
  })

  it("lets a newer snapshot supersede the ops it already folded in", () => {
    // The relay regenerated 39002 after the add, and dropped Bob while doing it.
    expect(
      membersOf([
        makeEvent(ROOM_ADMINS, RELAY, 50, [ADMIN]),
        makeEvent(ROOM_ADD_MEMBER, ADMIN, 100, [BOB]),
        makeEvent(ROOM_MEMBERS, RELAY, 200, [ALICE]),
      ]),
    ).toEqual([ALICE])
  })

  it("takes the member from the p tag rather than the op's author", () => {
    // The admin authors the add; Bob is its subject. Reading `pubkey` here would
    // make the admin a member and leave Bob out.
    expect(
      membersOf([
        makeEvent(ROOM_ADMINS, RELAY, 50, [ADMIN]),
        makeEvent(ROOM_ADD_MEMBER, ADMIN, 100, [BOB]),
      ]),
    ).toEqual([BOB])
  })

  it("ignores ops from a pubkey with no authority over the room", () => {
    expect(
      membersOf([
        makeEvent(ROOM_ADMINS, RELAY, 50, [ADMIN]),
        makeEvent(ROOM_ADD_MEMBER, MALLORY, 100, [MALLORY]),
      ]),
    ).toEqual([])
  })

  it("accepts ops authored by the relay itself", () => {
    expect(membersOf([makeEvent(ROOM_ADD_MEMBER, RELAY, 100, [BOB])])).toEqual([BOB])
  })

  it("applies a remove published after the snapshot", () => {
    expect(
      membersOf([
        makeEvent(ROOM_ADMINS, RELAY, 50, [ADMIN]),
        makeEvent(ROOM_MEMBERS, RELAY, 100, [ALICE, BOB]),
        makeEvent(ROOM_REMOVE_MEMBER, ADMIN, 200, [BOB]),
      ]),
    ).toEqual([ALICE])
  })

  it("resolves join and leave by recency, not by arrival order", () => {
    // Published newest-first, so anything reading the repository in insertion
    // order sees the join last and reports Pending.
    expect(
      statusOf([makeEvent(ROOM_LEAVE, ALICE, 200), makeEvent(ROOM_JOIN, ALICE, 100)], ALICE),
    ).toEqual(MembershipStatus.Initial)

    expect(
      statusOf([makeEvent(ROOM_JOIN, ALICE, 200), makeEvent(ROOM_LEAVE, ALICE, 100)], ALICE),
    ).toEqual(MembershipStatus.Pending)
  })

  it("drops a request the membership state has already answered", () => {
    const events = [
      makeEvent(ROOM_ADMINS, RELAY, 50, [ADMIN]),
      makeEvent(ROOM_JOIN, ALICE, 100),
      makeEvent(ROOM_ADD_MEMBER, ADMIN, 200, [ALICE]),
    ]

    expect(statusOf(events, ALICE)).toEqual(MembershipStatus.Granted)
    expect(makeApp(events).use(Rooms).pendingJoins(URL).get()).toEqual([])
  })

  it("keeps a request the membership state hasn't caught up with", () => {
    const events = [makeEvent(ROOM_MEMBERS, RELAY, 100, []), makeEvent(ROOM_JOIN, ALICE, 200)]

    expect(statusOf(events, ALICE)).toEqual(MembershipStatus.Pending)
    expect(
      makeApp(events)
        .use(Rooms)
        .pendingJoins(URL)
        .get()
        .map(e => e.pubkey),
    ).toEqual([ALICE])
  })

  it("keeps other requests pending when one of them is accepted", () => {
    // Accepting Alice makes the relay regenerate 39002, stamped with the moment it did so.
    // Bob asked earlier and nobody has answered him, so his request has to survive it.
    const events = [
      makeEvent(ROOM_ADMINS, RELAY, 50, [ADMIN]),
      makeEvent(ROOM_JOIN, ALICE, 100),
      makeEvent(ROOM_JOIN, BOB, 100),
      makeEvent(ROOM_ADD_MEMBER, ADMIN, 200, [ALICE]),
      makeEvent(ROOM_MEMBERS, RELAY, 200, [ALICE]),
    ]

    expect(statusOf(events, ALICE)).toEqual(MembershipStatus.Granted)
    expect(statusOf(events, BOB)).toEqual(MembershipStatus.Pending)
    expect(
      makeApp(events)
        .use(Rooms)
        .pendingJoins(URL)
        .get()
        .map(e => e.pubkey),
    ).toEqual([BOB])
  })

  it("drops a request answered by an op the snapshot has already folded in", () => {
    // Bob was admitted and later removed, and the relay has regenerated 39002 since. The
    // remove no longer changes the member set, but it is still what answered his request.
    const events = [
      makeEvent(ROOM_ADMINS, RELAY, 50, [ADMIN]),
      makeEvent(ROOM_JOIN, BOB, 100),
      makeEvent(ROOM_ADD_MEMBER, ADMIN, 150, [BOB]),
      makeEvent(ROOM_REMOVE_MEMBER, ADMIN, 200, [BOB]),
      makeEvent(ROOM_MEMBERS, RELAY, 300, []),
    ]

    expect(membersOf(events)).toEqual([])
    expect(statusOf(events, BOB)).toEqual(MembershipStatus.Initial)
    expect(makeApp(events).use(Rooms).pendingJoins(URL).get()).toEqual([])
  })

  it("treats a room admin as granted without a membership entry", () => {
    expect(statusOf([makeEvent(ROOM_ADMINS, RELAY, 50, [ADMIN])], ADMIN)).toEqual(
      MembershipStatus.Granted,
    )
  })

  it("reports a member with no outstanding request as granted", () => {
    expect(statusOf([makeEvent(ROOM_MEMBERS, RELAY, 100, [ALICE])], ALICE)).toEqual(
      MembershipStatus.Granted,
    )
    expect(statusOf([makeEvent(ROOM_MEMBERS, RELAY, 100, [ALICE])], BOB)).toEqual(
      MembershipStatus.Initial,
    )
  })
})
