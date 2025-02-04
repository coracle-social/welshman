import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import * as T from "../src/Tools"

describe("Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })
  describe("Basic Utils", () => {
    it("should check for nil values", () => {
      expect(T.isNil(null)).toBe(true)
      expect(T.isNil(undefined)).toBe(true)
      expect(T.isNil(0)).toBe(false)
      expect(T.isNil("")).toBe(false)
    })

    it("should handle ifLet", () => {
      const fn = vi.fn()
      T.ifLet(undefined, fn)
      expect(fn).not.toHaveBeenCalled()

      T.ifLet(5, fn)
      expect(fn).toHaveBeenCalledWith(5)
    })

    it("should handle array operations", () => {
      const arr = [1, 2, 3]
      expect(T.first(arr)).toBe(1)
      expect(T.last(arr)).toBe(3)
    })
  })

  describe("Math Operations", () => {
    it("should handle basic math operations", () => {
      expect(T.add(2, 3)).toBe(5)
      expect(T.sub(5, 3)).toBe(2)
      expect(T.mul(2, 3)).toBe(6)
      expect(T.div(6, 2)).toBe(3)
    })

    it("should handle nil values in math operations", () => {
      expect(T.add(undefined, 3)).toBe(3)
      expect(T.sub(5, undefined)).toBe(5)
      expect(T.mul(undefined, undefined)).toBe(0)
    })

    it("should handle comparisons", () => {
      expect(T.lt(2, 3)).toBe(true)
      expect(T.gt(3, 2)).toBe(true)
      expect(T.lte(2, 2)).toBe(true)
      expect(T.gte(2, 2)).toBe(true)
    })
  })

  describe("Array Operations", () => {
    it("should handle array transformations", () => {
      expect(T.take(2, [1, 2, 3, 4])).toEqual([1, 2])
      expect(T.drop(2, [1, 2, 3, 4])).toEqual([3, 4])
      expect(T.uniq([1, 1, 2, 2, 3])).toEqual([1, 2, 3])
    })

    it("should handle chunk operations", () => {
      expect(T.chunk(2, [1, 2, 3, 4])).toEqual([
        [1, 2],
        [3, 4],
      ])
      expect(T.chunks(2, [1, 2, 3, 4])).toEqual([
        [1, 3],
        [2, 4],
      ])
    })

    it("should handle array sorting", () => {
      expect(T.sort([3, 1, 2])).toEqual([1, 2, 3])
      expect(T.sortBy(x => x.value, [{value: 3}, {value: 1}, {value: 2}])).toEqual([
        {value: 1},
        {value: 2},
        {value: 3},
      ])
    })
  })

  describe("Object Operations", () => {
    it("should handle object transformations", () => {
      const obj = {a: 1, b: 2, c: 3}
      expect(T.omit(["a"], obj)).toEqual({b: 2, c: 3})
      expect(T.pick(["a"], obj)).toEqual({a: 1})
    })

    it("should handle deep merging", () => {
      const a = {x: {y: 1}}
      const b = {x: {z: 2}}
      expect(T.deepMergeLeft(a, b)).toEqual({x: {y: 1, z: 2}})
    })
  })

  describe("Batch Operations", () => {
    it("should handle memoization", () => {
      const fn = vi.fn(x => x * 2)
      const memoized = T.memoize(fn)

      expect(memoized(2)).toBe(4)
      expect(memoized(2)).toBe(4)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("should handle throttling", async () => {
      const fn = vi.fn()
      const throttled = T.throttle(100, fn)

      throttled()
      throttled()
      throttled()

      expect(fn).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(200)

      expect(fn).toHaveBeenCalledTimes(2)
    })

    describe("batch", () => {
      it("should collect items and process them in batches", async () => {
        const processBatch = vi.fn()
        const batchFn = T.batch(100, processBatch)

        // Add items
        batchFn("a")
        batchFn("b")
        batchFn("c")

        // Initially the batch shouldn't be processed
        expect(processBatch).toHaveBeenCalledTimes(1)

        // Advance timer to trigger batch processing
        await vi.advanceTimersByTimeAsync(100)

        expect(processBatch).toHaveBeenCalledTimes(2)

        expect(processBatch).toHaveBeenCalledWith(["a"])
        expect(processBatch).toHaveBeenCalledWith(["b", "c"])
      })

      it("should handle multiple batch windows", async () => {
        const processBatch = vi.fn()
        const batchFn = T.batch(100, processBatch)

        // First batch
        batchFn("a")
        batchFn("b")
        batchFn("c")

        await vi.advanceTimersByTimeAsync(100)

        // Second batch
        batchFn("d")
        batchFn("e")
        batchFn("f")

        await vi.advanceTimersByTimeAsync(100)

        expect(processBatch).toHaveBeenCalledTimes(4)
        expect(processBatch).toHaveBeenCalledWith(["a"])
        expect(processBatch).toHaveBeenCalledWith(["b", "c"])
        expect(processBatch).toHaveBeenCalledWith(["d"])
        expect(processBatch).toHaveBeenCalledWith(["e", "f"])
      })
    })

    describe("batcher", () => {
      it("should batch requests and return results", async () => {
        const executeFn = vi.fn(async (requests: number[]) => requests.map(x => x * 2))

        const batchFn = T.batcher(100, executeFn)

        // Create multiple concurrent requests
        const promise1 = batchFn(1)
        const promise2 = batchFn(2)
        const promise3 = batchFn(3)

        await vi.advanceTimersByTimeAsync(100)

        const results = await Promise.all([promise1, promise2, promise3])

        expect(executeFn).toHaveBeenCalledTimes(1)
        expect(executeFn).toHaveBeenCalledWith([1, 2, 3])
        expect(results).toEqual([2, 4, 6])
      })

      it("should handle multiple batch windows", async () => {
        const executeFn = vi.fn(async (requests: number[]) => requests.map(x => x * 2))

        const batchFn = T.batcher(100, executeFn)

        // First batch
        const batch1Promise = Promise.all([batchFn(1), batchFn(2)])

        await vi.advanceTimersByTimeAsync(100)
        const batch1Results = await batch1Promise

        // Second batch
        const batch2Promise = Promise.all([batchFn(3), batchFn(4)])

        await vi.advanceTimersByTimeAsync(100)
        const batch2Results = await batch2Promise

        expect(executeFn).toHaveBeenCalledTimes(2)
        expect(batch1Results).toEqual([2, 4])
        expect(batch2Results).toEqual([6, 8])
      })

      it("should throw error if execute returns wrong number of results", async () => {
        const executeFn = vi.fn(
          async (requests: number[]) => [requests[0] * 2], // Return fewer results than requests
        )

        const batchFn = T.batcher(100, executeFn)

        const batchPromise = Promise.all([batchFn(1), batchFn(2)])

        await vi.advanceTimersByTimeAsync(200)

        await expect(batchPromise).rejects.toThrow("Execute must return a result for each request")
      })
    })

    describe("throttleWithValue", () => {
      it("should return cached value between updates", async () => {
        let counter = 0
        const getValue = vi.fn(() => ++counter)
        const throttledGet = T.throttleWithValue(100, getValue)

        // First call should execute immediately
        expect(throttledGet()).toBe(1)
        expect(getValue).toHaveBeenCalledTimes(1)

        // Subsequent calls within throttle window should return cached value
        expect(throttledGet()).toBe(1)
        expect(throttledGet()).toBe(1)
        expect(getValue).toHaveBeenCalledTimes(1)

        // After throttle window, should update value
        await vi.advanceTimersByTimeAsync(100)
        // the previous 2 called will have been batched, and the next throttledGet increase the counter to 3
        expect(throttledGet()).toBe(3)
        expect(getValue).toHaveBeenCalledTimes(3)
      })

      it("should update value at most once per throttle window", async () => {
        let counter = 0
        const getValue = vi.fn(() => ++counter)
        const throttledGet = T.throttleWithValue(100, getValue)

        // Initial value
        expect(throttledGet()).toBe(1)

        // Multiple calls within window
        for (let i = 0; i < 4; i++) {
          throttledGet()
          await vi.advanceTimersByTimeAsync(20) // 20ms each, still within 100ms window
        }

        expect(getValue).toHaveBeenCalledTimes(1)

        // After window
        await vi.advanceTimersByTimeAsync(100)
        // the previous called will have been batched, and the next throttledGet increase the counter to 3
        expect(throttledGet()).toBe(3)
        expect(getValue).toHaveBeenCalledTimes(3)
      })

      it("should handle zero throttle time", () => {
        let counter = 0
        const getValue = vi.fn(() => ++counter)
        const throttledGet = T.throttleWithValue(0, getValue)

        // Should update on every call
        expect(throttledGet()).toBe(1)
        expect(throttledGet()).toBe(2)
        expect(throttledGet()).toBe(3)
        expect(getValue).toHaveBeenCalledTimes(3)
      })
    })
  })

  describe("Time Utilities", () => {
    it("should handle time constants", () => {
      expect(T.MINUTE).toBe(60)
      expect(T.HOUR).toBe(60 * 60)
      expect(T.DAY).toBe(24 * 60 * 60)
    })

    it("should handle time calculations", () => {
      const timestamp = T.now()
      expect(typeof timestamp).toBe("number")
      expect(T.ms(1)).toBe(1000)
    })
  })

  describe("String Operations", () => {
    it("should handle URL formatting", () => {
      expect(T.stripProtocol("https://example.com")).toBe("example.com")
      expect(T.displayUrl("https://www.example.com/")).toBe("example.com")
      expect(T.displayDomain("example.com/path")).toBe("example.com")

      // @todo returns https
      // expect(T.displayDomain("https://example.com/path")).toBe("example.com")
    })

    it("should handle string truncation", () => {
      expect(T.ellipsize("hello world", 5)).toBe("hello...")
      expect(T.ellipsize("hi", 5)).toBe("hi")
    })
  })

  describe("Collection Operations", () => {
    it("should handle group operations", () => {
      const items = [
        {type: "a", val: 1},
        {type: "a", val: 2},
        {type: "b", val: 3},
      ]
      const grouped = T.groupBy(x => x.type, items)
      expect(grouped.get("a")?.length).toBe(2)
      expect(grouped.get("b")?.length).toBe(1)
    })

    it("should handle indexing", () => {
      const items = [
        {id: 1, val: "a"},
        {id: 2, val: "b"},
      ]
      const indexed = T.indexBy(x => x.id, items)
      expect(indexed.get(1)?.val).toBe("a")
    })
  })

  describe("Type Checking", () => {
    it("should identify plain objects", () => {
      expect(T.isPojo({})).toBe(true)
      expect(T.isPojo([])).toBe(false)
      expect(T.isPojo(null)).toBe(false)
      expect(T.isPojo(new Date())).toBe(false)
    })

    it("should handle deep equality", () => {
      expect(T.equals({a: 1}, {a: 1})).toBe(true)
      expect(T.equals({a: 1}, {a: 2})).toBe(false)
      expect(T.equals([1, 2], [1, 2])).toBe(true)
      expect(T.equals(new Set([1, 2]), new Set([1, 2]))).toBe(true)
    })
  })
})
