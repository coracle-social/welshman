import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {ConnectionEvent} from "@welshman/net"
import type {Connection} from "@welshman/net"
import {now} from "@welshman/lib"
import {Relay, relays} from "../src/relays"
import {trackRelayStats} from "../src/relays"
import {get} from "svelte/store"

describe("Relay Stats", () => {
  const mockUrl = "wss://test.relay"
  let mockConnection: Connection

  beforeEach(() => {
    vi.useFakeTimers()
    // Reset relays store
    relays.set([])

    // Create mock connection
    mockConnection = {
      url: mockUrl,
      state: {
        pendingPublishes: new Map(),
        pendingRequests: new Map(),
      },
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    } as any
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe("trackRelayStats", () => {
    it("should subscribe to all connection events", () => {
      trackRelayStats(mockConnection)

      expect(mockConnection.on).toHaveBeenCalledWith(ConnectionEvent.Open, expect.any(Function))
      expect(mockConnection.on).toHaveBeenCalledWith(ConnectionEvent.Close, expect.any(Function))
      expect(mockConnection.on).toHaveBeenCalledWith(ConnectionEvent.Send, expect.any(Function))
      expect(mockConnection.on).toHaveBeenCalledWith(ConnectionEvent.Receive, expect.any(Function))
      expect(mockConnection.on).toHaveBeenCalledWith(ConnectionEvent.Error, expect.any(Function))
    })

    it("should unsubscribe from all events when cleanup is called", () => {
      const cleanup = trackRelayStats(mockConnection)
      cleanup()

      expect(mockConnection.off).toHaveBeenCalledWith(ConnectionEvent.Open, expect.any(Function))
      expect(mockConnection.off).toHaveBeenCalledWith(ConnectionEvent.Close, expect.any(Function))
      expect(mockConnection.off).toHaveBeenCalledWith(ConnectionEvent.Send, expect.any(Function))
      expect(mockConnection.off).toHaveBeenCalledWith(ConnectionEvent.Receive, expect.any(Function))
      expect(mockConnection.off).toHaveBeenCalledWith(ConnectionEvent.Error, expect.any(Function))
    })
  })

  describe("Connection Event Handlers", () => {
    let eventHandlers: Record<string, Function> = {}

    beforeEach(() => {
      eventHandlers = {}
      mockConnection.on.mockImplementation((event, handler) => {
        eventHandlers[event] = handler
      })
      trackRelayStats(mockConnection)

      // Add initial relay to the store
      relays.set([{url: mockUrl}])

      // Allow batched updates to process
      vi.runAllTimers()
    })

    it("should update stats on connection open", () => {
      eventHandlers[ConnectionEvent.Open](mockConnection)
      vi.runAllTimers()

      const updatedRelays = get(relays) as Relay[]
      expect(updatedRelays[0].stats?.open_count).toBe(1)
      expect(updatedRelays[0].stats?.last_open).toBeGreaterThan(0)
    })

    it("should update stats on connection close", () => {
      eventHandlers[ConnectionEvent.Close](mockConnection)
      vi.runAllTimers()

      const updatedRelays = get(relays) as Relay[]
      expect(updatedRelays[0].stats?.close_count).toBe(1)
      expect(updatedRelays[0].stats?.last_close).toBeGreaterThan(0)
    })

    it("should update stats on REQ send", () => {
      eventHandlers[ConnectionEvent.Send](mockConnection, ["REQ", "test"])
      vi.runAllTimers()

      const updatedRelays = get(relays) as Relay[]
      expect(updatedRelays[0].stats?.request_count).toBe(1)
      expect(updatedRelays[0].stats?.last_request).toBeGreaterThanOrEqual(now() - 1)
    })

    it("should update stats on EVENT send", () => {
      eventHandlers[ConnectionEvent.Send](mockConnection, ["EVENT", {}])
      vi.runAllTimers()

      const updatedRelays = get(relays) as Relay[]
      expect(updatedRelays[0].stats?.publish_count).toBe(1)
      expect(updatedRelays[0].stats?.last_publish).toBeGreaterThanOrEqual(now() - 1)
    })

    it("should update stats on OK receive with success", () => {
      const eventId = "test-event"
      mockConnection.state.pendingPublishes.set(eventId, {sent: now() - 1000})

      eventHandlers[ConnectionEvent.Receive](mockConnection, ["OK", eventId, true])
      vi.runAllTimers()

      const updatedRelays = get(relays) as Relay[]
      expect(updatedRelays[0].stats?.publish_success_count).toBe(1)
      expect(updatedRelays[0].stats?.publish_timer).toBe(1000)
    })

    it("should update stats on OK receive with failure", () => {
      const eventId = "test-event"
      mockConnection.state.pendingPublishes.set(eventId, {sent: Date.now() - 1000})

      eventHandlers[ConnectionEvent.Receive](mockConnection, ["OK", eventId, false])
      vi.runAllTimers()

      const updatedRelays = get(relays) as Relay[]
      expect(updatedRelays[0].stats?.publish_failure_count).toBe(1)
    })

    it("should update stats on EOSE receive", () => {
      const subId = "test-sub"
      mockConnection.state.pendingRequests.set(subId, {sent: now() - 1000})

      eventHandlers[ConnectionEvent.Receive](mockConnection, ["EOSE", subId])
      vi.runAllTimers()

      const updatedRelays = get(relays) as Relay[]
      expect(updatedRelays[0].stats?.eose_count).toBe(1)
      expect(updatedRelays[0].stats?.eose_timer).toBe(1000)
    })

    it("should update stats on error", () => {
      eventHandlers[ConnectionEvent.Error](mockConnection)
      vi.runAllTimers()

      const updatedRelays = get(relays) as Relay[]
      expect(updatedRelays[0].stats?.last_error).toBeGreaterThan(0)
      expect(updatedRelays[0].stats?.recent_errors).toHaveLength(1)
    })

    it("should limit recent errors to 10", () => {
      // Trigger 12 errors
      for (let i = 0; i < 12; i++) {
        eventHandlers[ConnectionEvent.Error](mockConnection)
        vi.advanceTimersByTime(1000)
      }

      const updatedRelays = get(relays) as Relay[]
      expect(updatedRelays[0].stats?.recent_errors).toHaveLength(10)
    })
  })
})
