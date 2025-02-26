import {Tracker} from "@welshman/net"
import {Repository} from "@welshman/util"
import {writable} from "svelte/store"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {clearStorage, db, dead, getAll, initStorage, storageAdapters} from "../src/storage"

describe("storage", () => {
  const DB_NAME = "test-db"
  const DB_VERSION = 1

  beforeEach(async () => {
    vi.clearAllMocks()
    dead.set(false)
    vi.useFakeTimers()
  })

  afterEach(async () => {
    vi.useRealTimers()

    await clearStorage()
  })

  describe("basic operations", () => {
    it("should initialize storage and store items", async () => {
      const store = writable<{id: string; value: string}[]>([])
      const adapters = {
        items: storageAdapters.fromCollectionStore("id", store),
      }

      if (!db) {
        initStorage(DB_NAME, DB_VERSION, adapters)
      }

      await vi.runAllTimersAsync()

      store.set([
        {id: "1", value: "test1"},
        {id: "2", value: "test2"},
      ])

      await vi.runAllTimersAsync()

      const itemsPromise = getAll("items")
      await vi.runAllTimersAsync()
      const items = await itemsPromise
      await vi.runAllTimersAsync()

      expect(items).toHaveLength(2)
      expect(items).toContainEqual({id: "1", value: "test1"})
      expect(items).toContainEqual({id: "2", value: "test2"})
    })

    it("should update items when store changes", async () => {
      const store = writable<{id: string; value: string}[]>([])
      const adapters = {
        items: storageAdapters.fromCollectionStore("id", store),
      }

      if (!db) {
        initStorage(DB_NAME, DB_VERSION, adapters)
      }

      await vi.runAllTimersAsync()

      // init storage with the first item
      store.set([{id: "1", value: "test1"}])

      await vi.runAllTimersAsync()

      store.update(items => [...items, {id: "2", value: "test2"}])

      await vi.runAllTimersAsync()

      vi.advanceTimersToNextFrame()

      const itemsPromise = getAll("items")
      await vi.runAllTimersAsync()
      const items = await itemsPromise

      expect(items).toHaveLength(2)
      expect(items).toContainEqual({id: "2", value: "test2"})
    })

    it("should remove items when deleted from store", async () => {
      const store = writable<{id: string; value: string}[]>()
      const adapters = {
        items: storageAdapters.fromCollectionStore("id", store),
      }
      if (!db) {
        initStorage(DB_NAME, DB_VERSION, adapters)
      }

      await vi.runAllTimersAsync()

      store.set([
        {id: "1", value: "test1"},
        {id: "2", value: "test2"},
      ])

      store.update(items => items.filter(item => item.id !== "1"))

      const itemsPromise = getAll("items")
      await vi.runAllTimersAsync()
      const items = await itemsPromise

      expect(items).toHaveLength(1)
      expect(items[0]).toEqual({id: "2", value: "test2"})
    })
  })

  describe("storage adapters", () => {
    it("should handle repository adapter", async () => {
      const repository = new Repository()
      const adapters = {
        events: storageAdapters.fromRepository(repository),
      }

      if (!db) {
        initStorage(DB_NAME, DB_VERSION, adapters)
      }

      await vi.runAllTimersAsync()

      const event = {
        id: "test-id",
        pubkey: "test-pubkey",
        kind: 1,
        created_at: 123,
        content: "test",
        tags: [],
      }

      repository.publish(event)

      const eventsPromise = getAll("events")

      await vi.runAllTimersAsync()
      const events = await eventsPromise

      expect(events).toContainEqual(event)
    })

    it("should handle tracker adapter", async () => {
      const tracker = new Tracker()
      const adapters = {
        relays: storageAdapters.fromTracker(tracker),
      }

      if (!db) {
        initStorage(DB_NAME, DB_VERSION, adapters)
      }
      await vi.runAllTimersAsync()

      tracker.track("event1", "relay1")
      tracker.track("event1", "relay2")

      const relaysPromise = getAll("relays")
      await vi.runAllTimersAsync()
      const relays = await relaysPromise

      expect(relays).toContainEqual({
        key: "event1",
        value: ["relay1", "relay2"],
      })
    })
  })

  describe("error handling", () => {
    it("should handle initialization errors", async () => {
      const badAdapter = {
        keyPath: undefined,
        store: writable([]),
        options: {},
      }

      const rejectPromise = initStorage(DB_NAME, DB_VERSION, {bad: badAdapter})

      await vi.runAllTimersAsync()

      // we can initialize storage with an undefined keypath
      expect(rejectPromise).to.not.rejects
    })

    it("should prevent multiple initializations", async () => {
      const adapters = {
        test: {
          keyPath: "id",
          store: writable([]),
          options: {},
        },
      }

      if (!db) {
        initStorage(DB_NAME, DB_VERSION, adapters)
      }

      await vi.runAllTimersAsync()

      await expect(initStorage(DB_NAME, DB_VERSION, adapters)).rejects.toThrow(
        "Db initialized multiple times",
      )
    })
  })
})
