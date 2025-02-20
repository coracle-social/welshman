import {ctx} from "@welshman/lib"
import type {TrustedEvent} from "@welshman/util"
import {vi, describe, it, expect, beforeEach} from "vitest"
import {Subscription, SubscriptionEvent} from "../../src/Subscribe"
import {ConnectionEvent} from "../../src/ConnectionEvent"

describe("Subscription", () => {
  let mockExecutor: any
  let mockConnection: any
  let mockExecutorSub: any

  const relayUrl = "wss://test.relay/"

  beforeEach(() => {
    vi.useFakeTimers()
    mockExecutorSub = {unsubscribe: vi.fn()}
    mockConnection = {
      url: relayUrl,
      auth: {attempt: vi.fn().mockResolvedValue(undefined)},
      on: vi.fn(),
      off: vi.fn(),
    }
    mockExecutor = {
      subscribe: vi.fn().mockReturnValue(mockExecutorSub),
      target: {
        connections: [mockConnection],
        cleanup: vi.fn(),
      },
    }

    ctx.net = {
      ...ctx.net,
      getExecutor: vi.fn().mockReturnValue(mockExecutor),
      isDeleted: vi.fn().mockReturnValue(false),
      matchFilters: vi.fn().mockReturnValue(true),
      isValid: vi.fn().mockReturnValue(true),
    }
  })

  describe("event handling", () => {
    it("should handle duplicate events", () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [],
      })
      const spy = vi.fn()
      sub.on(SubscriptionEvent.Duplicate, spy)

      // Simulate duplicate event
      const event = {id: "event123"} as TrustedEvent
      sub.tracker.track(event.id, relayUrl)
      sub.onEvent(relayUrl, event)

      expect(spy).toHaveBeenCalledWith(relayUrl, event)
    })

    it("should handle deleted events", () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [],
      })
      const spy = vi.fn()
      sub.on(SubscriptionEvent.DeletedEvent, spy)

      // @ts-ignore
      ctx.net.isDeleted.mockReturnValue(true)
      const event = {id: "event123"} as TrustedEvent
      sub.onEvent(relayUrl, event)

      expect(spy).toHaveBeenCalledWith(relayUrl, event)
    })

    it("should handle failed filters", () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [],
      })
      const spy = vi.fn()
      sub.on(SubscriptionEvent.FailedFilter, spy)
      // @ts-ignore
      ctx.net.matchFilters.mockReturnValue(false)
      const event = {id: "event123"} as TrustedEvent
      sub.onEvent(relayUrl, event)

      expect(spy).toHaveBeenCalledWith(relayUrl, event)
    })

    it("should handle invalid events", () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [],
      })
      const spy = vi.fn()
      sub.on(SubscriptionEvent.Invalid, spy)
      // @ts-ignore
      ctx.net.isValid.mockReturnValue(false)
      const event = {id: "event123"} as TrustedEvent
      sub.onEvent(relayUrl, event)

      expect(spy).toHaveBeenCalledWith(relayUrl, event)
    })

    it("should handle valid events", () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [],
      })
      const spy = vi.fn()
      sub.on(SubscriptionEvent.Event, spy)

      const event = {id: "event123"} as TrustedEvent
      sub.onEvent(relayUrl, event)

      expect(spy).toHaveBeenCalledWith(relayUrl, event)
    })
  })

  describe("execution", () => {
    it("should setup auth timeout", async () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [{kinds: [1]}],
        authTimeout: 1000,
      })

      await sub.execute()

      expect(mockConnection.auth.attempt).toHaveBeenCalledWith(1000)
    })

    it("should chunk filters", async () => {
      const filters = Array(10).fill({kinds: [1]})
      const sub = new Subscription({
        relays: [relayUrl],
        filters,
      })

      await sub.execute()

      expect(mockExecutor.subscribe).toHaveBeenCalledTimes(2) // 8 filters + 2 filters
    })

    it("should handle empty filters", async () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [],
      })
      const spy = vi.fn()
      sub.on(SubscriptionEvent.Complete, spy)

      await sub.execute()

      expect(spy).toHaveBeenCalled()
      expect(mockExecutor.subscribe).not.toHaveBeenCalled()
    })

    it("should setup connection close handlers", async () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [{kinds: [1]}],
      })

      await sub.execute()

      expect(mockConnection.on).toHaveBeenCalledWith(ConnectionEvent.Close, sub.onClose)
    })
  })

  describe("completion", () => {
    it("should complete on timeout", async () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [{kinds: [1]}],
        timeout: 1000,
      })
      const spy = vi.fn()
      sub.on(SubscriptionEvent.Complete, spy)

      await sub.execute()
      await vi.advanceTimersByTimeAsync(1000)

      expect(spy).toHaveBeenCalled()
    })

    it("should complete on abort signal", async () => {
      const controller = new AbortController()
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [{kinds: [1]}],
        signal: controller.signal,
      })
      const spy = vi.fn()
      sub.on(SubscriptionEvent.Complete, spy)

      await sub.execute()
      controller.abort()

      expect(spy).toHaveBeenCalled()
    })

    it("should complete when all relays close", () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [{kinds: [1]}],
      })
      const spy = vi.fn()
      sub.on(SubscriptionEvent.Complete, spy)

      sub.onClose(mockConnection)

      expect(spy).toHaveBeenCalled()
    })

    it("should complete on EOSE when closeOnEose is true", () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [{kinds: [1]}],
        closeOnEose: true,
      })
      const spy = vi.fn()
      sub.on(SubscriptionEvent.Complete, spy)

      sub.onEose(relayUrl)

      expect(spy).toHaveBeenCalled()
    })
  })

  describe("cleanup", () => {
    it("should cleanup on completion", async () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [{kinds: [1]}],
      })

      await sub.execute()
      sub.onComplete()

      expect(mockExecutorSub.unsubscribe).toHaveBeenCalled()
      expect(mockExecutor.target.cleanup).toHaveBeenCalled()
      expect(mockConnection.off).toHaveBeenCalledWith(ConnectionEvent.Close, sub.onClose)
    })

    it("should only cleanup once", async () => {
      const sub = new Subscription({
        relays: [relayUrl],
        filters: [{kinds: [1]}],
      })

      await sub.execute()
      sub.onComplete()
      sub.onComplete()

      expect(mockExecutorSub.unsubscribe).toHaveBeenCalledTimes(1)
      expect(mockExecutor.target.cleanup).toHaveBeenCalledTimes(1)
    })
  })
})
