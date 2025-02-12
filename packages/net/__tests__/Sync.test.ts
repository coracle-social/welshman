import {diff, pull, push, sync, pullWithoutNegentropy, pushWithoutNegentropy} from "../src/Sync"
import {ctx, now} from "@welshman/lib"
import type {SignedEvent, TrustedEvent, Filter} from "@welshman/util"
import {vi, describe, it, expect, beforeEach} from "vitest"
import {subscribe} from "../src/Subscribe"
import {publish} from "../src/Publish"

// Mock dependencies
vi.mock("../src/Subscribe", () => ({
  subscribe: vi.fn(),
}))

vi.mock("../src/Publish", () => ({
  publish: vi.fn(),
}))

vi.mock("@welshman/lib", async importOriginal => {
  return {
    ...(await importOriginal()),
    now: vi.fn().mockReturnValue(1000),
  }
})

describe("Sync", () => {
  let mockExecutor: any
  let mockDiffSub: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockDiffSub = {unsubscribe: vi.fn()}
    mockExecutor = {
      diff: vi.fn().mockImplementation((filter, events, {onMessage, onClose}) => {
        // Simulate diff message
        onMessage("relay1", {have: ["id1"], need: ["id2"]})
        onClose()
        return mockDiffSub
      }),
      target: {
        cleanup: vi.fn(),
      },
    }

    ctx.net = {
      ...ctx.net,
      getExecutor: vi.fn().mockReturnValue(mockExecutor),
    }

    // Mock subscribe to simulate event reception
    vi.mocked(subscribe).mockImplementation(({onEvent, onClose, onComplete}) => {
      if (onEvent) {
        onEvent({id: "id2", created_at: 900} as TrustedEvent)
      }
      onClose?.("relay1")
      onComplete?.()
      return {close: vi.fn()}
    })

    // Mock publish to return resolved result
    vi.mocked(publish).mockImplementation(() => ({
      result: Promise.resolve(new Map()),
      id: "pub1",
      created_at: 1000,
      emitter: {} as any,
      request: {} as any,
      status: new Map(),
    }))
  })

  describe("diff", () => {
    it("should aggregate diff results by relay", async () => {
      const result = await diff({
        relays: ["relay1", "relay2"],
        filters: [{kinds: [1]}],
        events: [{id: "id1"} as TrustedEvent],
      })

      expect(result).toEqual([
        {
          relay: "relay1",
          have: ["id1"],
          need: ["id2"],
        },
        {
          relay: "relay2",
          have: ["id1"],
          need: ["id2"],
        },
      ])
    })

    it("should handle multiple filters", async () => {
      const result = await diff({
        relays: ["relay1"],
        filters: [{kinds: [1]}, {kinds: [2]}],
        events: [{id: "id1"} as TrustedEvent],
      })

      expect(mockExecutor.diff).toHaveBeenCalledTimes(2)
    })

    it("should handle diff errors", async () => {
      mockExecutor.diff.mockImplementation((filter, events, {onError}) => {
        onError("relay1", "error message")
        return mockDiffSub
      })

      await expect(
        diff({
          relays: ["relay1"],
          filters: [{kinds: [1]}],
          events: [],
        }),
      ).rejects.toEqual("error message")
    })
  })

  describe("pull", () => {
    it("should pull needed events", async () => {
      const onEvent = vi.fn()
      const result = await pull({
        relays: ["relay1"],
        filters: [{kinds: [1]}],
        events: [],
        onEvent,
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("id2")
      expect(onEvent).toHaveBeenCalled()
    })

    it("should limit duplicate pulls", async () => {
      // Mock diff to return same need from multiple relays
      mockExecutor.diff.mockImplementation((filter, events, {onMessage, onClose}) => {
        onMessage("relay1", {have: [], need: ["id2"]})
        onClose()
        return mockDiffSub
      })

      await pull({
        relays: ["relay1", "relay2", "relay3"],
        filters: [{kinds: [1]}],
        events: [],
      })

      // Should only subscribe maximum twice for the same ID
      expect(subscribe).toHaveBeenCalledTimes(2)
    })

    it("should chunk large ID lists", async () => {
      const manyIds = Array.from({length: 2000}, (_, i) => `id${i}`)
      mockExecutor.diff.mockImplementation((filter, events, {onMessage, onClose}) => {
        onMessage("relay1", {have: [], need: manyIds})
        onClose()
        return mockDiffSub
      })

      await pull({
        relays: ["relay1"],
        filters: [{kinds: [1]}],
        events: [],
      })

      // Should split into chunks of 1024
      expect(subscribe).toHaveBeenCalledTimes(2)
    })
  })

  describe("push", () => {
    it("should push events to relays that have them", async () => {
      await push({
        relays: ["relay1"],
        filters: [{kinds: [1]}],
        events: [{id: "id1"} as SignedEvent],
      })

      expect(publish).toHaveBeenCalledWith({
        event: expect.any(Object),
        relays: ["relay1"],
      })
    })

    it("should skip events with no matching relays", async () => {
      mockExecutor.diff.mockImplementation((filter, events, {onMessage, onClose}) => {
        onMessage("relay1", {have: [], need: []})
        onClose()
        return mockDiffSub
      })

      await push({
        relays: ["relay1"],
        filters: [{kinds: [1]}],
        events: [{id: "id1"} as SignedEvent],
      })

      expect(publish).not.toHaveBeenCalled()
    })
  })

  describe("sync", () => {
    it("should perform pull and push operations", async () => {
      await sync({
        relays: ["relay1"],
        filters: [{kinds: [1]}],
        events: [{id: "id1"} as SignedEvent],
      })

      expect(subscribe).toHaveBeenCalled()
      expect(publish).toHaveBeenCalled()
    })
  })

  describe("pullWithoutNegentropy", () => {
    it("should pull events until no more results", async () => {
      let callCount = 0
      vi.mocked(subscribe).mockImplementation(({onEvent, onComplete}) => {
        if (callCount++ < 2) {
          onEvent?.({id: `id${callCount}`, created_at: 900} as TrustedEvent)
        }
        onComplete?.()
        return {close: vi.fn()}
      })

      const result = await pullWithoutNegentropy({
        relays: ["relay1"],
        filters: [{kinds: [1]}],
      })

      expect(result).toHaveLength(2)
      expect(subscribe).toHaveBeenCalledTimes(3) // 2 with results + 1 final check
    })

    it("should update until timestamp based on events", async () => {
      let callCount = 0
      vi.mocked(subscribe).mockImplementation(({onEvent, onComplete}) => {
        if (!callCount) {
          onEvent?.({id: "id1", created_at: 500} as TrustedEvent)
          callCount++
        }
        onComplete?.()
        return {close: vi.fn()}
      })

      await pullWithoutNegentropy({
        relays: ["relay1"],
        filters: [{kinds: [1]}],
      })

      // Second subscription should use updated until
      expect(subscribe).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([expect.objectContaining({until: 499})]),
        }),
      )
    })
  })

  describe("pushWithoutNegentropy", () => {
    it("should push all events to all relays", async () => {
      await pushWithoutNegentropy({
        relays: ["relay1", "relay2"],
        events: [{id: "id1"} as SignedEvent, {id: "id2"} as SignedEvent],
      })

      expect(publish).toHaveBeenCalledTimes(2)
      expect(publish).toHaveBeenCalledWith({
        event: expect.any(Object),
        relays: ["relay1", "relay2"],
      })
    })
  })
})
