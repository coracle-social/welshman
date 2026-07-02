import {get, writable} from "svelte/store"
import {describe, expect, it} from "vitest"
import {Repository, Tracker} from "@welshman/net"
import {ROOM_META, RELAY_MEMBERS} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {deriveItemsByKeyByUrl} from "../src/repository"

// eventToItem resolves on the microtask queue (addEvent awaits it), so give the
// derivation a macrotask to settle before asserting.
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey: "ee".repeat(32),
    created_at: 0,
    kind: ROOM_META,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

const dTag = (event: TrustedEvent) => event.tags.find(t => t[0] === "d")?.[1] ?? ""

describe("deriveItemsByKeyByUrl", () => {
  it("keys the same coordinate seen on two relays under two composite keys", async () => {
    const repository = new Repository()
    const tracker = new Tracker()

    // A single NIP-29 group-meta event that lives on two relays.
    const event = makeEvent({id: "a".repeat(64), tags: [["d", "group1"]]})

    repository.publish(event)
    tracker.track(event.id, "wss://a.example")
    tracker.track(event.id, "wss://b.example")

    const store = deriveItemsByKeyByUrl<TrustedEvent>({
      filters: [{kinds: [ROOM_META]}],
      repository,
      tracker,
      eventToItem: e => e,
      getKey: (e, url) => `${url}'${dTag(e)}`,
    })

    const unsub = store.subscribe(() => {})
    await tick()

    const map = get(store)

    expect(map.size).toBe(2)
    expect(map.get("wss://a.example'group1")?.id).toBe(event.id)
    expect(map.get("wss://b.example'group1")?.id).toBe(event.id)

    unsub()
  })

  it("uses the relay url alone as the key for per-relay replaceables", async () => {
    const repository = new Repository()
    const tracker = new Tracker()

    const membersA = makeEvent({id: "a".repeat(64), kind: RELAY_MEMBERS})
    const membersB = makeEvent({
      id: "b".repeat(64),
      kind: RELAY_MEMBERS,
      pubkey: "cc".repeat(32),
    })

    repository.publish(membersA)
    repository.publish(membersB)
    tracker.track(membersA.id, "wss://a.example")
    tracker.track(membersB.id, "wss://b.example")

    const store = deriveItemsByKeyByUrl<TrustedEvent>({
      filters: [{kinds: [RELAY_MEMBERS]}],
      repository,
      tracker,
      eventToItem: e => e,
      getKey: (_e, url) => url,
    })

    const unsub = store.subscribe(() => {})
    await tick()

    const map = get(store)

    expect(map.size).toBe(2)
    expect(map.get("wss://a.example")?.id).toBe(membersA.id)
    expect(map.get("wss://b.example")?.id).toBe(membersB.id)

    unsub()
  })

  it("drops a key when its relay provenance is removed", async () => {
    const repository = new Repository()
    const tracker = new Tracker()

    const event = makeEvent({id: "a".repeat(64), tags: [["d", "group1"]]})

    repository.publish(event)
    tracker.track(event.id, "wss://a.example")
    tracker.track(event.id, "wss://b.example")

    const store = deriveItemsByKeyByUrl<TrustedEvent>({
      filters: [{kinds: [ROOM_META]}],
      repository,
      tracker,
      eventToItem: e => e,
      getKey: (e, url) => `${url}'${dTag(e)}`,
    })

    const unsub = store.subscribe(() => {})
    await tick()

    tracker.removeRelay(event.id, "wss://a.example")

    const map = get(store)

    expect(map.has("wss://a.example'group1")).toBe(false)
    expect(map.get("wss://b.example'group1")?.id).toBe(event.id)

    unsub()
  })

  it("excludes items whose getKey returns undefined", async () => {
    const repository = new Repository()
    const tracker = new Tracker()

    const relaySelf = "self".padEnd(64, "0")
    const signed = makeEvent({id: "a".repeat(64), pubkey: relaySelf, tags: [["d", "g"]]})
    const forged = makeEvent({id: "b".repeat(64), pubkey: "ee".repeat(32), tags: [["d", "g"]]})

    repository.publish(signed)
    repository.publish(forged)
    tracker.track(signed.id, "wss://a.example")
    tracker.track(forged.id, "wss://a.example")

    const store = deriveItemsByKeyByUrl<TrustedEvent>({
      filters: [{kinds: [ROOM_META]}],
      repository,
      tracker,
      eventToItem: e => e,
      // Only key events authored by the relay's self pubkey (relay-signed).
      getKey: (e, url) => (e.pubkey === relaySelf ? `${url}'${dTag(e)}` : undefined),
    })

    const unsub = store.subscribe(() => {})
    await tick()

    const map = get(store)

    expect(map.size).toBe(1)
    expect(map.get("wss://a.example'g")?.id).toBe(signed.id)

    unsub()
  })

  it("re-evaluates keys when revalidateOn fires (e.g. relay self loads late)", async () => {
    const repository = new Repository()
    const tracker = new Tracker()

    const relaySelf = "self".padEnd(64, "0")
    const event = makeEvent({id: "a".repeat(64), pubkey: relaySelf, tags: [["d", "g"]]})

    repository.publish(event)
    tracker.track(event.id, "wss://a.example")

    // Self pubkey unknown at first (event excluded), then loaded.
    const selfByUrl = writable<Record<string, string>>({})

    const store = deriveItemsByKeyByUrl<TrustedEvent>({
      filters: [{kinds: [ROOM_META]}],
      repository,
      tracker,
      eventToItem: e => e,
      getKey: (e, url) => (get(selfByUrl)[url] === e.pubkey ? `${url}'${dTag(e)}` : undefined),
      revalidateOn: selfByUrl,
    })

    const unsub = store.subscribe(() => {})
    await tick()

    expect(get(store).size).toBe(0)

    // The relay's self pubkey arrives; the collection should re-evaluate.
    selfByUrl.set({"wss://a.example": relaySelf})
    await tick()

    expect(get(store).get("wss://a.example'g")?.id).toBe(event.id)

    unsub()
  })
})
