import {ctx} from "@welshman/lib"
import {AuthMode} from "@welshman/net"
import {SignedEvent} from "@welshman/util"
import {beforeEach, describe, expect, it, vi} from "vitest"
import {Connection} from "../src/Connection"
import {ConnectionEvent} from "../src/ConnectionEvent"
import {ConnectionStats} from "../src/ConnectionStats"

describe("ConnectionStats", () => {
  let connection: Connection
  let stats: ConnectionStats

  beforeEach(() => {
    vi.useFakeTimers()
    connection = new Connection("wss://test.relay/")
    stats = connection.stats
    ctx.net = {...ctx.net, authMode: AuthMode.Explicit}
  })

  describe("connection events tracking", () => {
    it("should track socket open events", () => {
      const now = Date.now()
      connection.emit(ConnectionEvent.Open, connection)

      expect(stats.openCount).toBe(1)
      expect(stats.lastOpen).toBeGreaterThanOrEqual(now)
    })

    it("should track socket close events", () => {
      const now = Date.now()
      connection.emit(ConnectionEvent.Close, connection)

      expect(stats.closeCount).toBe(1)
      expect(stats.lastClose).toBeGreaterThanOrEqual(now)
    })

    it("should track socket error events", () => {
      const now = Date.now()
      connection.emit(ConnectionEvent.Error, connection)

      expect(stats.errorCount).toBe(1)
      expect(stats.lastError).toBeGreaterThanOrEqual(now)
    })

    it("should accumulate multiple events", () => {
      connection.emit(ConnectionEvent.Open, connection)
      connection.emit(ConnectionEvent.Close, connection)
      connection.emit(ConnectionEvent.Open, connection)
      connection.emit(ConnectionEvent.Error, connection)

      expect(stats.openCount).toBe(2)
      expect(stats.closeCount).toBe(1)
      expect(stats.errorCount).toBe(1)
    })
  })

  describe("message tracking", () => {
    describe("outgoing messages", () => {
      it("should track REQ messages", () => {
        const now = Date.now()
        connection.emit(ConnectionEvent.Send, ["REQ", "id1"])

        expect(stats.requestCount).toBe(1)
        expect(stats.lastRequest).toBeGreaterThanOrEqual(now)
      })

      it("should track EVENT messages", () => {
        const now = Date.now()
        connection.emit(ConnectionEvent.Send, ["EVENT", {id: "123"}])

        expect(stats.publishCount).toBe(1)
        expect(stats.lastPublish).toBeGreaterThanOrEqual(now)
      })
    })

    describe("incoming messages", () => {
      it("should track received EVENT messages", () => {
        const now = Date.now()
        connection.emit(ConnectionEvent.Receive, ["EVENT", {id: "123"}])

        expect(stats.eventCount).toBe(1)
        expect(stats.lastEvent).toBeGreaterThanOrEqual(now)
      })

      it("should track AUTH messages", () => {
        const now = Date.now()
        connection.emit(ConnectionEvent.Receive, ["AUTH", "challenge"])

        expect(stats.lastAuth).toBeGreaterThanOrEqual(now)
      })

      it("should track NOTICE messages", () => {
        connection.emit(ConnectionEvent.Receive, ["NOTICE", "test"])
        expect(stats.noticeCount).toBe(1)
      })
    })
  })

  describe("publish tracking", () => {
    beforeEach(() => {
      // Setup a pending publish
      connection.state.pendingPublishes.set("123", {
        sent: Date.now() - 1000, // 1 second ago
        event: {id: "123"} as SignedEvent,
      })
    })

    it("should track successful publishes", () => {
      connection.emit(ConnectionEvent.Receive, ["OK", "123", true])

      expect(stats.publishSuccessCount).toBe(1)
      expect(stats.publishFailureCount).toBe(0)
      expect(stats.publishTimer).toBeGreaterThan(0)
    })

    it("should track failed publishes", () => {
      connection.emit(ConnectionEvent.Receive, ["OK", "123", false])

      expect(stats.publishSuccessCount).toBe(0)
      expect(stats.publishFailureCount).toBe(1)
      expect(stats.publishTimer).toBeGreaterThan(0)
    })

    it("should accumulate publish timing", () => {
      const firstTimer = stats.publishTimer
      // First publish took 1000ms
      connection.emit(ConnectionEvent.Receive, ["OK", "123", true])

      // Second publish took 2000ms
      connection.state.pendingPublishes.set("456", {
        sent: Date.now() - 2000,
        event: {id: "456"} as SignedEvent,
      })

      connection.emit(ConnectionEvent.Receive, ["OK", "456", true])

      expect(stats.publishTimer).toBe(firstTimer + 1000 + 2000)
      expect(stats.publishSuccessCount).toBe(2)
    })

    it("should not increment publish timer for unknown publishes", () => {
      connection.emit(ConnectionEvent.Receive, ["OK", "unknown", true])

      expect(stats.publishSuccessCount).toBe(1)
      expect(stats.publishFailureCount).toBe(0)
      expect(stats.publishTimer).toBe(0)
    })
  })

  describe("EOSE tracking", () => {
    beforeEach(() => {
      // Setup a pending request
      connection.state.pendingRequests.set("req1", {
        sent: Date.now() - 1000,
        filters: [],
      })
    })

    it("should track first EOSE for a request", () => {
      connection.emit(ConnectionEvent.Receive, ["EOSE", "req1"])

      expect(stats.eoseCount).toBe(1)
      expect(stats.eoseTimer).toBeGreaterThan(0)
    })

    it("should ignore subsequent EOSE for same request", () => {
      // Mark request as already EOSE'd
      connection.state.pendingRequests.set("req1", {
        sent: Date.now() - 1000,
        filters: [],
        eose: true,
      })

      connection.emit(ConnectionEvent.Receive, ["EOSE", "req1"])

      expect(stats.eoseCount).toBe(0)
      expect(stats.eoseTimer).toBe(0)
    })

    it("should accumulate EOSE timing", () => {
      // First EOSE took 1000ms
      connection.emit(ConnectionEvent.Receive, ["EOSE", "req1"])
      const firstTimer = stats.eoseTimer

      // Setup second request that takes 2000ms
      connection.state.pendingRequests.set("req2", {
        sent: Date.now() - 2000,
        filters: [],
      })
      connection.emit(ConnectionEvent.Receive, ["EOSE", "req2"])

      expect(stats.eoseTimer).toBe(firstTimer + 2000)
      expect(stats.eoseCount).toBe(2)
    })
  })

  describe("speed calculations", () => {
    it("should calculate request speed", () => {
      stats.eoseCount = 2
      stats.eoseTimer = 3000 // 3 seconds total for 2 requests

      expect(stats.getRequestSpeed()).toBe(1500) // 1.5 seconds average
    })

    it("should return 0 request speed when no EOSE received", () => {
      expect(stats.getRequestSpeed()).toBe(0)
    })

    it("should calculate publish speed", () => {
      stats.publishSuccessCount = 2
      stats.publishTimer = 4000 // 4 seconds total for 2 publishes

      expect(stats.getPublishSpeed()).toBe(2000) // 2 seconds average
    })

    it("should return 0 publish speed when no successful publishes", () => {
      expect(stats.getPublishSpeed()).toBe(0)
    })
  })
})
