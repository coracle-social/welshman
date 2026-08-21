import {get} from "svelte/store"
import {describe, expect, it} from "vitest"
import {Repository, Tracker} from "@welshman/net"
import {DELETE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {deriveEventsById, deriveEventsByIdByUrl, deriveEventsByIdForUrl} from "../src/repository"

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
