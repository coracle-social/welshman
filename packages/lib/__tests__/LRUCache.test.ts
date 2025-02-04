import {describe, it, expect, beforeEach, vi} from "vitest"
import {LRUCache, cached, simpleCache} from "../src/LRUCache"

describe("Caches", () => {
  describe("LRUCache", () => {
    describe("basic operations", () => {
      let cache: LRUCache<string, number>

      beforeEach(() => {
        cache = new LRUCache(3) // Max size of 3
      })

      it("should set and get values", () => {
        cache.set("a", 1)
        expect(cache.get("a")).toBe(1)
      })

      it("should check if key exists", () => {
        cache.set("a", 1)
        expect(cache.has("a")).toBe(true)
        expect(cache.has("b")).toBe(false)
      })

      it("should evict least recently used items when exceeding maxSize", () => {
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("c", 3)
        cache.set("d", 4)

        expect(cache.has("a")).toBe(false) // 'a' should be evicted
        expect(cache.get("b")).toBe(2)
        expect(cache.get("c")).toBe(3)
        expect(cache.get("d")).toBe(4)
      })

      it("should update access order on get", () => {
        cache.set("a", 1) // keys = [a]
        cache.set("b", 2) // keys = [a, b]
        cache.set("c", 3) // keys = [a, b, c]

        cache.get("b") // keys = [a, b, c, b]
        cache.get("b") // keys = [a, b, c, b, b]
        cache.get("b") // keys = [a, b, c, b, b, b] size at limit (maxSize * 2 = 6)
        cache.get("a") // keys = [b, b, a] keys is over limit, only the 3 last are kept
        cache.set("d", 4) // keys = [b, b, a, d],

        // @todo clarify with @staab the intended behavior
        // "a" was recently accessed, it should not be evicted
        expect(cache.has("a")).toBe(true) // 'a' should be present
        expect(cache.has("b")).toBe(false) // 'b' should be evicted
      })
    })
  })

  describe("cached function", () => {
    it("should cache function results", () => {
      const mockGetValue = vi.fn((args: [number]) => args[0] * 2)

      const cachedFn = cached({
        maxSize: 2,
        getKey: (args: [number]) => args[0],
        getValue: mockGetValue,
      })

      expect(cachedFn(1)).toBe(2)
      expect(cachedFn(1)).toBe(2)
      expect(mockGetValue).toHaveBeenCalledTimes(1) // Should only compute once
    })

    it("should respect maxSize", () => {
      const cachedFn = cached({
        maxSize: 2,
        getKey: (args: [number]) => args[0],
        getValue: (args: [number]) => args[0] * 2,
      })

      cachedFn(1)
      cachedFn(2)
      cachedFn(3)

      expect(cachedFn.cache.has(1)).toBe(false) // Should be evicted
      expect(cachedFn.cache.has(2)).toBe(true)
      expect(cachedFn.cache.has(3)).toBe(true)
    })
  })

  describe("simpleCache", () => {
    it("should cache function results with default settings", () => {
      const mockFn = vi.fn((v: number[]) => v[0] + v[1])
      const cachedFn = simpleCache(mockFn)

      expect(cachedFn(1, 2)).toBe(3)
      expect(cachedFn(1, 2)).toBe(3)
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it("should use string join as default key", () => {
      const cachedFn = simpleCache((v: number[]) => v[0] + v[1])

      cachedFn(1, 2)
      expect(cachedFn.cache.has("1:2")).toBe(true)
    })
  })
})
