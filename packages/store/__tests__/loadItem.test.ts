import {get, writable} from "svelte/store"
import {describe, expect, it, vi} from "vitest"
import {makeLoadItem, makeForceLoadItem, makeDeriveItem} from "../src/repository"

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe("item loaders", () => {
  const getItem = (items: Record<string, string>) => (key: string) => items[key]

  describe("makeForceLoadItem", () => {
    it("resolves to the freshly read item", async () => {
      const items: Record<string, string> = {}
      const load = makeForceLoadItem(async (key: string) => {
        items[key] = "loaded"
      }, getItem(items))

      await expect(load("a")).resolves.toBe("loaded")
    })

    it("rejects when the fetch rejects", async () => {
      const load = makeForceLoadItem(async () => {
        throw new Error("relay is down")
      }, getItem({}))

      await expect(load("a")).rejects.toThrow("relay is down")
    })

    it("rejects rather than throwing when the fetch throws synchronously", async () => {
      const load = makeForceLoadItem(
        (() => {
          throw new Error("bad key")
        }) as any,
        getItem({}),
      )

      let promise: Promise<unknown> | undefined

      expect(() => (promise = load("a"))).not.toThrow()
      await expect(promise).rejects.toThrow("bad key")
    })
  })

  describe("makeLoadItem", () => {
    it("rejects when the fetch rejects", async () => {
      const load = makeLoadItem(async () => {
        throw new Error("relay is down")
      }, getItem({}))

      await expect(load("a")).rejects.toThrow("relay is down")
    })

    it("rejects rather than throwing when the fetch throws synchronously", async () => {
      const load = makeLoadItem(
        (() => {
          throw new Error("bad key")
        }) as any,
        getItem({}),
      )

      let promise: Promise<unknown> | undefined

      expect(() => (promise = load("a"))).not.toThrow()
      await expect(promise).rejects.toThrow("bad key")
    })

    it("resolves to stale rather than rejecting while backing off", async () => {
      const fetch = vi.fn(async () => {
        throw new Error("relay is down")
      })

      const load = makeLoadItem(fetch, getItem({}))

      await expect(load("a")).rejects.toThrow("relay is down")

      // The second call is throttled, so it reports what's on hand
      await expect(load("a")).resolves.toBeUndefined()
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it("rejects every caller waiting on the same in-flight fetch", async () => {
      const fetch = vi.fn(async () => {
        await tick()

        throw new Error("relay is down")
      })

      const load = makeLoadItem(fetch, getItem({}))
      const results = await Promise.allSettled([load("a"), load("a")])

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(results.map(r => r.status)).toEqual(["rejected", "rejected"])
    })

    it("clears the pending entry after a failure so the key can be retried", async () => {
      let attempt = 0
      const items: Record<string, string> = {}
      const load = makeLoadItem(async (key: string) => {
        if (attempt++ === 0) throw new Error("relay is down")

        items[key] = "loaded"
      }, getItem(items))

      await expect(load("a")).rejects.toThrow("relay is down")

      // Backoff is 2^1 seconds after one failed attempt, so let it lapse
      vi.useFakeTimers()
      vi.setSystemTime(Date.now() + 5000)

      try {
        await expect(load("a")).resolves.toBe("loaded")
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe("makeDeriveItem", () => {
    it("does not let a failed load escape as an unhandled rejection", async () => {
      const store = writable(new Map([["a", "cached"]]))
      const onDerive = () => Promise.reject(new Error("relay is down"))
      const derive = makeDeriveItem<string>(store, onDerive)

      expect(() => derive("a")).not.toThrow()
      expect(get(derive("a"))).toBe("cached")

      await tick()
    })
  })
})
