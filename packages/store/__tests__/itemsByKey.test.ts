import {get, writable} from "svelte/store"
import {describe, expect, it} from "vitest"
import {Repository, Tracker} from "@welshman/net"
import {MUTES} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {
  deriveItems,
  deriveItemsByKey,
  deriveItemsByKeyByUrl,
  deriveItemsSorted,
} from "../src/repository"
import type {EventToItem} from "../src/repository"

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "a".repeat(64),
    pubkey: "e".repeat(64),
    created_at: 0,
    kind: MUTES,
    tags: [],
    content: "",
    sig: "0".repeat(128),
    ...o,
  }) as TrustedEvent

// Every NIP-51 list kind decrypts, so its reader is a promise rather than a value.
const decrypting = async (event: TrustedEvent) => event

const makeCollection = (
  repository: Repository,
  eventToItem: EventToItem<TrustedEvent> = decrypting,
) =>
  deriveItemsByKey<TrustedEvent>({
    filters: [{kinds: [MUTES]}],
    repository,
    eventToItem,
    getKey: event => event.pubkey,
  })

describe("reading a collection", () => {
  it("indexes an event that arrived while nothing was subscribed", async () => {
    const repository = new Repository()
    const collection = makeCollection(repository)
    const event = makeEvent()

    repository.publish(event)

    expect(await collection.read(event.pubkey)).toBe(event)
  })

  it("commits a parse the snapshot read misses", async () => {
    const repository = new Repository()
    const collection = makeCollection(repository)
    const event = makeEvent()

    repository.publish(event)

    expect(get(collection).get(event.pubkey)).toBeUndefined()
    expect(await collection.read(event.pubkey)).toBe(event)
  })

  it("answers synchronously when the parse needs no IO", () => {
    const repository = new Repository()
    const collection = makeCollection(repository, event => event)
    const event = makeEvent()

    repository.publish(event)

    expect(collection.read(event.pubkey)).toBe(event)
  })

  it("resolves rather than rejecting when a parse throws", async () => {
    const repository = new Repository()
    const collection = makeCollection(repository, async () => {
      throw new Error("the signer refused")
    })

    const event = makeEvent()

    repository.publish(event)

    expect(await collection.read(event.pubkey)).toBeUndefined()
  })

  it("waits out a parse that takes several round trips", async () => {
    const repository = new Repository()
    const collection = makeCollection(repository, async event => {
      for (let i = 0; i < 5; i++) await Promise.resolve()

      return event
    })

    const event = makeEvent()

    repository.publish(event)

    expect(await collection.read(event.pubkey)).toBe(event)
  })

  it("serves an item it holds without waiting on another event's parse", async () => {
    const repository = new Repository()
    const stuck = makeEvent({id: "b".repeat(64), pubkey: "f".repeat(64)})
    const collection = makeCollection(repository, async event =>
      event.pubkey === stuck.pubkey ? new Promise<TrustedEvent>(() => {}) : event,
    )

    const event = makeEvent()

    repository.publish(event)

    await collection.read(event.pubkey)

    repository.publish(stuck)

    expect(collection.read(event.pubkey)).toBe(event)
  })
})

describe("reading a relay-scoped collection", () => {
  const url = "wss://relay.example/"

  const makeRelayCollection = (repository: Repository, tracker: Tracker) =>
    deriveItemsByKeyByUrl<TrustedEvent>({
      filters: [{kinds: [MUTES]}],
      repository,
      tracker,
      eventToItem: decrypting,
      getKey: (item, relay) => `${relay}'${item.pubkey}`,
    })

  it("indexes an event that arrived while nothing was subscribed", async () => {
    const repository = new Repository()
    const tracker = new Tracker()
    const collection = makeRelayCollection(repository, tracker)
    const event = makeEvent()

    repository.publish(event)
    tracker.track(event.id, url)

    expect(await collection.read(`${url}'${event.pubkey}`)).toBe(event)
  })

  it("keeps what an event parsed to across the rebuild each read runs", async () => {
    const repository = new Repository()
    const tracker = new Tracker()
    const collection = makeRelayCollection(repository, tracker)
    const event = makeEvent()

    repository.publish(event)
    tracker.track(event.id, url)

    await collection.read(`${url}'${event.pubkey}`)

    expect(get(collection).get(`${url}'${event.pubkey}`)).toBe(event)
  })
})

describe("deriving a collection's items", () => {
  it("lists what the collection has indexed", () => {
    const repository = new Repository()
    const collection = makeCollection(repository, event => event)

    for (const char of ["a", "b", "c"]) {
      repository.publish(makeEvent({id: char.repeat(64), pubkey: char.repeat(64)}))
    }

    expect(get(deriveItems(collection)).length).toBe(3)
  })

  it("sorts items by their sort value", () => {
    const items = writable([{at: 2}, {at: 1}])
    const sorted = deriveItemsSorted((item: {at: number}) => item.at, items)

    expect(get(sorted).map(item => item.at)).toEqual([1, 2])
  })
})
