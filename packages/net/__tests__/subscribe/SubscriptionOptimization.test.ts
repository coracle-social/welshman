import {ctx} from "@welshman/lib"
import type {TrustedEvent} from "@welshman/util"
import {vi, describe, it, expect, beforeEach} from "vitest"
import {
  calculateSubscriptionGroup,
  mergeSubscriptions,
  Subscription,
  SubscriptionEvent,
} from "../../src/Subscribe"

describe("Subscription optimization", () => {
  let mockExecutor: any
  beforeEach(() => {
    // Setup mock executor
    mockExecutor = {
      subscribe: vi.fn().mockReturnValue({unsubscribe: vi.fn()}),
      target: {
        connections: [],
        cleanup: vi.fn(),
      },
    }
    ctx.net = {
      ...ctx.net,
      optimizeSubscriptions: vi.fn(subs =>
        subs.map(sub => ({
          relays: sub.request.relays,
          filters: sub.request.filters,
        })),
      ),
      getExecutor: vi.fn().mockReturnValue(mockExecutor),
      isDeleted: vi.fn().mockReturnValue(false),
      matchFilters: vi.fn().mockReturnValue(true),
      isValid: vi.fn().mockReturnValue(true),
    }
  })

  describe("calculateSubscriptionGroup", () => {
    it("should group by timeout", () => {
      const sub = new Subscription({
        relays: ["relay1"],
        filters: [],
        timeout: 1000,
      })

      expect(calculateSubscriptionGroup(sub)).toBe("timeout:1000")
    })

    it("should group by auth timeout", () => {
      const sub = new Subscription({
        relays: ["relay1"],
        filters: [],
        authTimeout: 500,
      })

      expect(calculateSubscriptionGroup(sub)).toBe("authTimeout:500")
    })

    it("should group by closeOnEose", () => {
      const sub = new Subscription({
        relays: ["relay1"],
        filters: [],
        closeOnEose: true,
      })

      expect(calculateSubscriptionGroup(sub)).toBe("closeOnEose")
    })

    it("should combine multiple properties", () => {
      const sub = new Subscription({
        relays: ["relay1"],
        filters: [],
        timeout: 1000,
        authTimeout: 500,
        closeOnEose: true,
      })

      expect(calculateSubscriptionGroup(sub)).toBe("timeout:1000|authTimeout:500|closeOnEose")
    })
  })

  describe("mergeSubscriptions", () => {
    it("should merge relays and filters", () => {
      const subs = [
        new Subscription({
          relays: ["relay1"],
          filters: [{kinds: [1]}],
        }),
        new Subscription({
          relays: ["relay2"],
          filters: [{kinds: [2]}],
        }),
      ]

      const merged = mergeSubscriptions(subs)

      expect(merged.request.relays).toEqual(["relay1", "relay2"])
      expect(merged.request.filters).toEqual([{kinds: [1, 2]}])
    })

    it("should propagate events from original subscriptions to merged subscription", () => {
      const mergedSpy = vi.fn()
      const subs = [
        new Subscription({
          relays: ["relay1"],
          filters: [{kinds: [1]}],
        }),
        new Subscription({
          relays: ["relay2"],
          filters: [{kinds: [1]}],
        }),
      ]

      const merged = mergeSubscriptions(subs)
      merged.on(SubscriptionEvent.Event, mergedSpy)

      const event = {id: "event123", kind: 1} as TrustedEvent

      // Simulate event from original subscription
      subs[0].emit(SubscriptionEvent.Event, "relay1", event)

      expect(mergedSpy).toHaveBeenCalledWith("relay1", event)
    })

    it("should avoid duplicate events in merged subscription", () => {
      const mergedSpy = vi.fn()
      const subs = [
        new Subscription({
          relays: ["relay1"],
          filters: [{kinds: [1]}],
        }),
        new Subscription({
          relays: ["relay2"],
          filters: [{kinds: [1]}],
        }),
      ]

      const merged = mergeSubscriptions(subs)
      merged.on(SubscriptionEvent.Event, mergedSpy)

      const event = {id: "event123", kind: 1} as TrustedEvent

      // Simulate same event from both subscriptions
      subs[0].emit(SubscriptionEvent.Event, "relay1", event)
      subs[1].emit(SubscriptionEvent.Event, "relay2", event)

      expect(mergedSpy).toHaveBeenCalledTimes(1)
      expect(mergedSpy).toHaveBeenCalledWith("relay1", event)
    })

    it("should complete when all subscriptions complete", () => {
      const spy = vi.fn()
      const subs = [
        new Subscription({
          relays: ["relay1"],
          filters: [{kinds: [1]}],
        }),
        new Subscription({
          relays: ["relay2"],
          filters: [{kinds: [1]}],
        }),
      ]

      const merged = mergeSubscriptions(subs)
      merged.on(SubscriptionEvent.Complete, spy)

      subs[0].emit(SubscriptionEvent.Complete)
      expect(spy).not.toHaveBeenCalled()

      subs[1].emit(SubscriptionEvent.Complete)
      expect(spy).toHaveBeenCalled()
    })
  })
})
