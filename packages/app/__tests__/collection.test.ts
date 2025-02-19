import {describe, it, expect, beforeEach, vi, afterEach} from "vitest"
import {get, writable} from "svelte/store"
import {collection} from "../src/collection"
import {freshness, setFreshnessImmediate} from "../src/freshness"
import {now} from "@welshman/lib"

describe("collection", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
    vi.useRealTimers()
    freshness.set({})
  })

  describe("basic functionality", () => {
    it("should create a collection with indexStore", () => {
      const items = [{id: "1", value: "test"}]
      const store = writable(items)

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
      })

      expect(col.indexStore.get().get("1")).toEqual(items[0])
    })

    it("should update indexStore when store changes", () => {
      const store = writable<Array<{id: string; value: string}>>([])
      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
      })

      const newItem = {id: "1", value: "test"}
      store.set([newItem])

      expect(get(col.indexStore).get("1")).toEqual(newItem)
    })
  })

  describe("loadItem", () => {
    it("should return stale item if no loader provided", async () => {
      const items = [{id: "1", value: "test"}]
      const store = writable(items)

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
      })

      const result = await col.loadItem("1")
      expect(result).toEqual(items[0])
    })

    it("should return undefined for non-existent items when no loader provided", async () => {
      const store = writable<Array<{id: string}>>([])

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
      })

      const result = await col.loadItem("1")
      expect(result).toBeUndefined()
    })

    it("should use loader to fetch new items", async () => {
      const store = writable<Array<{id: string; value: string}>>([])
      const mockLoad = vi.fn().mockResolvedValue({id: "1", value: "loaded"})

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
        load: mockLoad,
      })

      await col.loadItem("1")
      expect(mockLoad).toHaveBeenCalledWith("1")
    })

    it("should handle concurrent loading of the same item", async () => {
      const store = writable<Array<{id: string; value: string}>>([])
      const mockLoad = vi.fn().mockResolvedValue({id: "1", value: "loaded"})

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
        load: mockLoad,
      })

      // Start multiple concurrent loads
      const loads = Promise.all([col.loadItem("1"), col.loadItem("1"), col.loadItem("1")])

      await loads
      // Should only call load once
      expect(mockLoad).toHaveBeenCalledTimes(1)
    })

    it("should respect freshness checks", async () => {
      await vi.advanceTimersByTimeAsync(1000)
      const store = writable<Array<{id: string; value: string}>>([{id: "1", value: "stale"}])
      const mockLoad = vi.fn()

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
        load: mockLoad,
      })
      // force freshness
      setFreshnessImmediate({ns: "test", key: "1", ts: now()})
      await col.loadItem("1")
      // Should not call load because item is fresh
      expect(mockLoad).toHaveBeenCalledTimes(0)
    })

    it("should reload stale items", async () => {
      const mockLoad = vi.fn()
      const store = writable([{id: "1", value: "test"}])

      const col = collection({
        name: "test",
        store,
        getKey: (item: any) => item.id,
        load: mockLoad,
      })

      // load the item to set freshness
      await col.loadItem("1")

      await vi.advanceTimersByTimeAsync(4000 * 1000)

      await col.loadItem("1")
      expect(mockLoad).toHaveBeenCalledTimes(2)
    })

    it("should implement exponential backoff for failed attempts", async () => {
      const store = writable<Array<{id: string; value: string}>>([])
      const mockLoad = vi.fn().mockResolvedValue(undefined)

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
        load: mockLoad,
      })

      // First attempt
      await col.loadItem("1")
      expect(mockLoad).toHaveBeenCalledTimes(1)

      //force freshness
      setFreshnessImmediate({ns: "test", key: "1", ts: now()})

      // Immediate retry should be throttled
      await col.loadItem("1").catch(() => {})
      expect(mockLoad).toHaveBeenCalledTimes(1)
    })
  })

  describe("deriveItem", () => {
    it("should return readable undefined for null keys", () => {
      const store = writable<Array<{id: string}>>([])

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
      })

      const derived = col.deriveItem(null)
      expect(get(derived)).toBeUndefined()
    })

    it("should create a derived store that updates with the source", () => {
      const store = writable<Array<{id: string; value: string}>>([])

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
      })

      const derived = col.deriveItem("1")
      expect(get(derived)).toBeUndefined()

      // Update source store
      store.set([{id: "1", value: "test"}])
      expect(get(derived)).toEqual({id: "1", value: "test"})
    })

    it("should trigger load when deriving non-existent item", () => {
      const store = writable<Array<{id: string; value: string}>>([])
      const mockLoad = vi.fn()

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
        load: mockLoad,
      })

      col.deriveItem("1")
      expect(mockLoad).toHaveBeenCalledWith("1")
    })
  })

  describe("error handling", () => {
    it("should handle loader failures gracefully", async () => {
      const store = writable<Array<{id: string; value: string}>>([])
      const mockLoad = vi.fn(() => {
        return Promise.reject("load failed")
      })
      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
        load: mockLoad,
      })
      const result = await col.loadItem("1")
      expect(result).toBeUndefined()
    })
  })
})
