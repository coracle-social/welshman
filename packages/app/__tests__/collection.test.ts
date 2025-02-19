import {describe, it, expect, beforeEach, vi, afterEach} from "vitest"
import {get, writable} from "svelte/store"
import {collection} from "../src/collection"
import * as freshness from "../src/freshness"

// Mock the freshness module
vi.mock("../src/freshness", () => ({
  getFreshness: vi.fn(),
  setFreshnessThrottled: vi.fn(),
}))

describe("collection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock implementations
    vi.mocked(freshness.getFreshness).mockImplementation(() => 0)
  })

  afterEach(() => {
    vi.resetModules()
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
      const store = writable<Array<{id: string; value: string}>>([{id: "1", value: "stale"}])
      const mockLoad = vi.fn()

      vi.mocked(freshness.getFreshness).mockReturnValue(Date.now())

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
        load: mockLoad,
      })

      await col.loadItem("1")
      // Should not call load because item is fresh
      expect(mockLoad).not.toHaveBeenCalled()
    })

    it("should implement exponential backoff for failed attempts", async () => {
      const store = writable<Array<{id: string; value: string}>>([])
      const mockLoad = vi.fn().mockRejectedValue(new Error("Failed to load"))

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
        load: mockLoad,
      })

      // First attempt
      await col.loadItem("1").catch(() => {})
      expect(mockLoad).toHaveBeenCalledTimes(1)

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
      const mockLoad = vi.fn().mockRejectedValue(new Error("Load failed"))

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
        load: mockLoad,
      })

      const result = await col.loadItem("1")
      expect(result).toBeUndefined()
    })

    it("should clean up pending promises after load completion", async () => {
      const store = writable<Array<{id: string; value: string}>>([])
      const mockLoad = vi.fn().mockResolvedValue({id: "1", value: "loaded"})

      const col = collection({
        name: "test",
        store,
        getKey: item => item.id,
        load: mockLoad,
      })

      await col.loadItem("1")
      // @ts-ignore - accessing private property for testing
      expect(col["pending"].size).toBe(0)
    })
  })
})
