import {ctx} from "@welshman/lib"
import {subscribe as baseSubscribe, SubscriptionEvent} from "@welshman/net"
import {getFilterResultCardinality, LOCAL_RELAY_URL} from "@welshman/util"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {repository} from "../src/core.js"
import {load, subscribe} from "../src/subscribe.ts"

// Mock dependencies
vi.mock("@welshman/lib", async () => ({
  ctx: {
    app: {
      requestDelay: 50,
      authTimeout: 500,
      requestTimeout: 3000,
    },
  },
  isNil: vi.fn(x => x === null || x === undefined),
}))

vi.mock("@welshman/util", async () => ({
  LOCAL_RELAY_URL: "ws://localhost:3000",
  getFilterResultCardinality: vi.fn(),
}))

vi.mock("@welshman/net", async () => {
  const mockEmitter = {
    emit: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  }

  return {
    subscribe: vi.fn(() => mockEmitter),
    SubscriptionEvent: {
      Event: "event",
      Complete: "complete",
      Eose: "eose",
    },
  }
})

vi.mock("../src/core.js", async () => ({
  repository: {
    query: vi.fn(() => []),
  },
}))

describe("subscribe.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe("subscribe", () => {
    it("should pass request to baseSubscribe with default options", () => {
      const request = {
        filters: [{kinds: [1], limit: 10}],
      }

      const result = subscribe(request)

      // Assert
      expect(baseSubscribe).toHaveBeenCalledWith({
        filters: [{kinds: [1], limit: 10}],
        relays: [],
        delay: ctx.app.requestDelay,
        authTimeout: ctx.app.authTimeout,
        timeout: 0, // timeout should be 0 when closeOnEose is not set
      })
      expect(result).toBeDefined()
    })

    it("should check filter cardinality when closeOnEose is true", () => {
      const request = {
        filters: [{kinds: [1], limit: 10}],
        closeOnEose: true,
      }
      vi.mocked(getFilterResultCardinality).mockReturnValue(10)

      subscribe(request)

      // Assert
      expect(getFilterResultCardinality).toHaveBeenCalledWith({kinds: [1], limit: 10})
    })

    it("should use cached results when filter cardinality matches repository results", () => {
      // Arrange
      const filter = {kinds: [1], limit: 2}
      const cachedEvents = [
        {id: "1", kind: 1, content: "test1", tags: [], pubkey: "pk1", created_at: 123, sig: "sig1"},
        {id: "2", kind: 1, content: "test2", tags: [], pubkey: "pk2", created_at: 456, sig: "sig2"},
      ]

      const request = {
        filters: [filter],
        closeOnEose: true,
      }

      vi.mocked(getFilterResultCardinality).mockReturnValue(2)
      vi.mocked(repository.query).mockReturnValue(cachedEvents)

      // Act
      const sub = subscribe(request)
      vi.runAllTimers() // Run setTimeout

      // Assert
      expect(repository.query).toHaveBeenCalledWith([filter])
      expect(sub.emit).toHaveBeenCalledWith(
        SubscriptionEvent.Event,
        LOCAL_RELAY_URL,
        cachedEvents[0],
      )
      expect(sub.emit).toHaveBeenCalledWith(
        SubscriptionEvent.Event,
        LOCAL_RELAY_URL,
        cachedEvents[1],
      )
      expect(request.filters).toEqual([]) // All filters should be removed
    })

    it("should keep filter when repository has fewer results than cardinality", () => {
      // Arrange
      const filter = {kinds: [1], limit: 10}
      const cachedEvents = [
        {id: "1", kind: 1, content: "test1", tags: [], pubkey: "pk1", created_at: 123, sig: "sig1"},
      ]

      const request = {
        filters: [filter],
        closeOnEose: true,
      }

      vi.mocked(getFilterResultCardinality).mockReturnValue(10)
      vi.mocked(repository.query).mockReturnValue(cachedEvents)

      // Act
      subscribe(request)

      // Assert
      expect(repository.query).toHaveBeenCalledWith([filter])
      expect(request.filters).toEqual([filter]) // Filter should be kept
    })

    it("should set timeout when closeOnEose is true", () => {
      // Arrange
      const request = {
        filters: [{kinds: [1], limit: 10}],
        closeOnEose: true,
      }

      // Act
      subscribe(request)

      // Assert
      expect(baseSubscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: ctx.app.requestTimeout,
        }),
      )
    })

    it("should respect custom options", () => {
      // Arrange
      const request = {
        filters: [{kinds: [1], limit: 10}],
        relays: ["wss://relay.example.com"],
        delay: 100,
        timeout: 5000,
        authTimeout: 1000,
      }

      // Act
      subscribe(request)

      // Assert
      expect(baseSubscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          relays: ["wss://relay.example.com"],
          delay: 100,
          timeout: 5000,
          authTimeout: 1000,
        }),
      )
    })

    it("should emit cached events asynchronously", () => {
      // Arrange
      const filter = {kinds: [1], limit: 2}
      const cachedEvents = [
        {id: "1", kind: 1, content: "test1", tags: [], pubkey: "pk1", created_at: 123, sig: "sig1"},
        {id: "2", kind: 1, content: "test2", tags: [], pubkey: "pk2", created_at: 456, sig: "sig2"},
      ]

      const request = {
        filters: [filter],
        closeOnEose: true,
      }

      vi.mocked(getFilterResultCardinality).mockReturnValue(2)
      vi.mocked(repository.query).mockReturnValue(cachedEvents)

      // Act
      const sub = subscribe(request)

      // Assert - should not have emitted events synchronously
      expect(sub.emit).not.toHaveBeenCalled()

      // Fast-forward timers
      vi.runAllTimers()

      // Now events should be emitted
      expect(sub.emit).toHaveBeenCalledTimes(2)
      expect(sub.emit).toHaveBeenCalledWith(
        SubscriptionEvent.Event,
        LOCAL_RELAY_URL,
        cachedEvents[0],
      )
      expect(sub.emit).toHaveBeenCalledWith(
        SubscriptionEvent.Event,
        LOCAL_RELAY_URL,
        cachedEvents[1],
      )
    })
  })

  describe("load", () => {
    it("should return a promise that resolves with events", async () => {
      // Arrange
      const request = {
        filters: [{kinds: [1], limit: 10}],
      }

      const mockEvents = [
        {id: "1", kind: 1, content: "test1", tags: [], pubkey: "pk1", created_at: 123, sig: "sig1"},
        {id: "2", kind: 1, content: "test2", tags: [], pubkey: "pk2", created_at: 456, sig: "sig2"},
      ]

      // Mock the subscribe function and event handling
      vi.mocked(baseSubscribe).mockReturnValue({
        on: (event, handler) => {
          // Simulate events
          if (event === SubscriptionEvent.Event) {
            mockEvents.forEach(evt => handler(LOCAL_RELAY_URL, evt))
          }

          // Simulate completion
          if (event === SubscriptionEvent.Complete) {
            setTimeout(() => handler(), 0)
          }

          return {unsubscribe: vi.fn()}
        },
        emit: vi.fn(),
        close: vi.fn(),
      })

      // Act
      const promise = load(request)
      vi.runAllTimers() // Run setTimeout for completion

      // Assert
      const events = await promise
      expect(events).toEqual(mockEvents)
      expect(baseSubscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          closeOnEose: true,
          timeout: ctx.app.requestTimeout,
        }),
      )
    })

    it("should override load options with request options", async () => {
      // Arrange
      const request = {
        filters: [{kinds: [1], limit: 10}],
        closeOnEose: false, // This should be overridden
        timeout: 1000, // This should be overridden
      }

      // Mock minimal subscription to resolve immediately
      vi.mocked(baseSubscribe).mockReturnValue({
        on: (event, handler) => {
          if (event === SubscriptionEvent.Complete) {
            setTimeout(() => handler(), 0)
          }
          return {unsubscribe: vi.fn()}
        },
        emit: vi.fn(),
        close: vi.fn(),
      })

      const promise = load(request)
      vi.runAllTimers()

      await promise
      expect(baseSubscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          closeOnEose: false,
          timeout: 1000,
        }),
      )
    })

    it("should collect events from multiple sources", async () => {
      // Arrange
      const request = {
        filters: [{kinds: [1], limit: 10}],
      }

      const localEvents = [
        {
          id: "1",
          kind: 1,
          content: "local1",
          tags: [],
          pubkey: "pk1",
          created_at: 123,
          sig: "sig1",
        },
      ]

      const remoteEvents = [
        {
          id: "2",
          kind: 1,
          content: "remote1",
          tags: [],
          pubkey: "pk2",
          created_at: 456,
          sig: "sig2",
        },
      ]

      // Simulate cached events triggering local events first
      vi.mocked(getFilterResultCardinality).mockReturnValue(1)
      vi.mocked(repository.query).mockReturnValue(localEvents)

      // Mock subscription that also receives remote events
      let eventHandler: any
      let completeHandler: any

      vi.mocked(baseSubscribe).mockReturnValue({
        on: (event: string, handler: any) => {
          if (event === SubscriptionEvent.Event) {
            eventHandler = handler
            // Simulate cached events
            localEvents.forEach(evt => handler(LOCAL_RELAY_URL, evt))
          }
          if (event === SubscriptionEvent.Complete) {
            completeHandler = handler
          }
          return {unsubscribe: vi.fn()}
        },
        emit: vi.fn(),
        close: vi.fn(),
      })

      const promise = load(request)

      // Simulate receiving remote events
      if (eventHandler) {
        remoteEvents.forEach(evt => eventHandler("wss://remote.com", evt))
      }

      // Simulate completion
      if (completeHandler) {
        setTimeout(() => completeHandler(), 0)
      }

      vi.runAllTimers()

      // Assert
      const events = await promise
      expect(events.length).toBe(2)
      expect(events).toContainEqual(localEvents[0])
      expect(events).toContainEqual(remoteEvents[0])
    })
  })
})
