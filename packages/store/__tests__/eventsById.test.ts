import {derived, get} from "svelte/store"
import {describe, expect, it} from "vitest"
import {Repository, Tracker} from "@welshman/net"
import {DELETE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {
  deriveEventsById,
  deriveEventsByIdByUrl,
  deriveEventsByIdForUrl,
  deriveEventsDesc,
  deriveIsDeleted,
  getEventsByIdForUrl,
  makeDeriveEvent,
} from "../src/repository"

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

// A kind 5 from the note's own author, newer than it, which is what makes the repository
// consider the note deleted.
const makeDelete = (target: TrustedEvent) =>
  makeEvent({
    id: "d".repeat(64),
    pubkey: target.pubkey,
    created_at: target.created_at + 1,
    kind: DELETE,
    tags: [["e", target.id]],
  })

const url = "wss://a.example"

describe("deriveEventsById", () => {
  it("drops an event deleted while subscribed", () => {
    const repository = new Repository()
    const note = makeEvent({id: "a".repeat(64)})

    repository.publish(note)

    const store = deriveEventsById({filters: [{kinds: [NOTE]}], repository})
    const unsub = store.subscribe(() => {})

    expect(get(store).size).toBe(1)

    repository.publish(makeDelete(note))

    expect(get(store).size).toBe(0)

    unsub()
  })

  it("keeps an event deleted while subscribed when includeDeleted is set", () => {
    const repository = new Repository()
    const note = makeEvent({id: "a".repeat(64)})

    repository.publish(note)

    const store = deriveEventsById({
      filters: [{kinds: [NOTE]}],
      repository,
      includeDeleted: true,
    })

    const unsub = store.subscribe(() => {})

    expect(get(store).size).toBe(1)

    repository.publish(makeDelete(note))

    // The live update has to agree with the initial query, which already retains it
    expect(get(store).get(note.id)?.id).toBe(note.id)

    unsub()
  })
})

describe("deriveEventsByIdByUrl", () => {
  it("keeps an event deleted while subscribed when includeDeleted is set", () => {
    const repository = new Repository()
    const tracker = new Tracker()
    const note = makeEvent({id: "a".repeat(64)})

    repository.publish(note)
    tracker.track(note.id, url)

    const store = deriveEventsByIdByUrl({
      filters: [{kinds: [NOTE]}],
      repository,
      tracker,
      includeDeleted: true,
    })

    const unsub = store.subscribe(() => {})

    expect(get(store).get(url)?.size).toBe(1)

    repository.publish(makeDelete(note))

    expect(get(store).get(url)?.get(note.id)?.id).toBe(note.id)

    unsub()
  })

  it("takes a signature the repository swapped in on an event it already holds", () => {
    const repository = new Repository()
    const tracker = new Tracker()
    const signed = makeEvent({id: "a".repeat(64)})
    const unsigned = {...signed, sig: undefined} as unknown as TrustedEvent

    repository.publish(unsigned)
    tracker.track(unsigned.id, url)

    const store = deriveEventsByIdByUrl({filters: [{kinds: [NOTE]}], repository, tracker})
    const unsub = store.subscribe(() => {})

    expect(get(store).get(url)?.get(unsigned.id)?.sig).toBeUndefined()

    repository.publish(signed)

    expect(get(store).get(url)?.get(signed.id)?.sig).toBe(signed.sig)

    unsub()
  })
})

describe("deriveEventsByIdForUrl", () => {
  it("keeps an event deleted while subscribed when includeDeleted is set", () => {
    const repository = new Repository()
    const tracker = new Tracker()
    const note = makeEvent({id: "a".repeat(64)})

    repository.publish(note)
    tracker.track(note.id, url)

    const store = deriveEventsByIdForUrl({
      url,
      filters: [{kinds: [NOTE]}],
      repository,
      tracker,
      includeDeleted: true,
    })

    const unsub = store.subscribe(() => {})

    expect(get(store).size).toBe(1)

    repository.publish(makeDelete(note))

    expect(get(store).get(note.id)?.id).toBe(note.id)

    unsub()
  })
})

describe("getEventsByIdForUrl", () => {
  // A filter naming its own ids used to replace the provenance check rather than narrow it
  it("keeps out an event the relay was never seen to hold", () => {
    const repository = new Repository()
    const tracker = new Tracker()
    const here = makeEvent({id: "a".repeat(64)})
    const elsewhere = makeEvent({id: "b".repeat(64)})

    repository.publish(here)
    repository.publish(elsewhere)
    tracker.track(here.id, url)
    tracker.track(elsewhere.id, "wss://b.example")

    const eventsById = getEventsByIdForUrl({
      url,
      filters: [{ids: [here.id, elsewhere.id]}],
      repository,
      tracker,
    })

    expect(Array.from(eventsById.keys())).toEqual([here.id])
  })

  it("counts a limit against the relay's events, not every relay's", () => {
    const repository = new Repository()
    const tracker = new Tracker()
    const events = Array.from({length: 10}, (_, i) =>
      makeEvent({id: i.toString(16).repeat(64), created_at: i}),
    )

    for (const event of events) {
      repository.publish(event)
      tracker.track(event.id, event.created_at < 2 ? url : "wss://b.example")
    }

    const eventsById = getEventsByIdForUrl({
      url,
      filters: [{kinds: [NOTE], limit: 3}],
      repository,
      tracker,
    })

    expect(new Set(eventsById.keys())).toEqual(new Set([events[0].id, events[1].id]))
  })
})

// Each store is a `Projection` whose getter is the matching one-shot query
describe("an event store's own read", () => {
  it("answers from the repository with nothing subscribed", () => {
    const repository = new Repository()
    const note = makeEvent({id: "a".repeat(64)})

    repository.publish(note)

    const events = deriveEventsById({filters: [{kinds: [NOTE]}], repository})

    expect(events.get().get(note.id)).toBe(note)
  })

  it("carries the read through a sort", () => {
    const repository = new Repository()
    const older = makeEvent({id: "a".repeat(64), created_at: 1})
    const newer = makeEvent({id: "b".repeat(64), created_at: 2})

    repository.publish(older)
    repository.publish(newer)

    const events = deriveEventsDesc(deriveEventsById({filters: [{kinds: [NOTE]}], repository}))

    expect(events.get().map(e => e.id)).toEqual([newer.id, older.id])
  })

  it("honors includeDeleted on a single event", () => {
    const repository = new Repository()
    const note = makeEvent({id: "a".repeat(64)})

    repository.publish(note)
    repository.publish(makeDelete(note))

    expect(makeDeriveEvent({repository})(note.id).get()).toBeUndefined()
    expect(makeDeriveEvent({repository, includeDeleted: true})(note.id).get()).toBe(note)
  })

  it("reads a deletion", () => {
    const repository = new Repository()
    const note = makeEvent({id: "a".repeat(64)})

    repository.publish(note)

    const isDeleted = deriveIsDeleted(repository, note)

    expect(isDeleted.get()).toBe(false)

    repository.publish(makeDelete(note))

    expect(isDeleted.get()).toBe(true)
  })

  it("is a store, so a caller derives from it without reaching for `.$`", () => {
    const repository = new Repository()

    repository.publish(makeEvent({id: "a".repeat(64)}))

    const size = derived(
      deriveEventsById({filters: [{kinds: [NOTE]}], repository}),
      $events => [...$events.keys()].length,
    )

    expect(get(size)).toBe(1)
  })
})
