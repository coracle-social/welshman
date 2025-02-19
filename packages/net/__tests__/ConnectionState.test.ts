import {ConnectionState} from "../src/ConnectionState"
import {Connection} from "../src/Connection"
import {SocketStatus} from "../src/Socket"
import {ConnectionEvent} from "../src/ConnectionEvent"
import {AUTH_JOIN, SignedEvent} from "@welshman/util"
import {vi, describe, it, expect, beforeEach} from "vitest"

describe("ConnectionState", () => {
  let connection: Connection
  let state: ConnectionState

  beforeEach(() => {
    vi.useFakeTimers()
    connection = new Connection("wss://test.relay/")
    connection.socket.status = SocketStatus.Open
    connection.socket.send = vi.fn().mockResolvedValue(undefined)
    connection.socket.open = vi.fn().mockResolvedValue(undefined)
    connection.send = vi.fn().mockResolvedValue(undefined)
    state = connection.state
  })

  describe("request tracking", () => {
    it("should track new REQ messages", async () => {
      const reqId = "req123"
      const filters = [{kinds: [1]}]

      connection.sender.worker.push(["REQ", reqId, ...filters])
      vi.advanceTimersByTime(50)

      expect(state.pendingRequests.has(reqId)).toBe(true)
      expect(state.pendingRequests.get(reqId)).toEqual({
        filters,
        sent: Date.now(),
        eose: undefined,
      })
    })

    it("should remove requests on CLOSE", async () => {
      const reqId = "req123"
      state.pendingRequests.set(reqId, {
        filters: [],
        sent: Date.now(),
      })

      connection.socket.worker.push(["CLOSED", reqId])
      vi.advanceTimersByTime(50)

      expect(state.pendingRequests.has(reqId)).toBe(false)
    })

    it("should mark requests as EOSE", async () => {
      const reqId = "req123"
      state.pendingRequests.set(reqId, {
        filters: [],
        sent: Date.now(),
      })

      connection.socket.worker.push(["EOSE", reqId])
      vi.advanceTimersByTime(50)

      expect(state.pendingRequests.get(reqId)?.eose).toBe(true)
    })
  })

  describe("publish tracking", () => {
    it("should track EVENT messages", async () => {
      const event = {id: "event123", kind: 1}

      connection.sender.worker.push(["EVENT", event])
      vi.advanceTimersByTime(50)

      expect(state.pendingPublishes.has(event.id)).toBeTruthy()
      expect(state.pendingPublishes.get(event.id)).toEqual({
        sent: Date.now(),
        event,
      })
    })

    it("should remove publishes on successful OK", async () => {
      const eventId = "event123"
      state.pendingPublishes.set(eventId, {
        sent: Date.now(),
        event: {id: eventId, kind: 1} as SignedEvent,
      })

      connection.socket.worker.push(["OK", eventId, true])
      vi.advanceTimersByTime(50)

      expect(state.pendingPublishes.has(eventId)).toBe(false)
    })

    it("should re-enqueue events on auth challenge", async () => {
      const event = {id: "event123", kind: 1} as SignedEvent
      state.pendingPublishes.set(event.id, {
        sent: Date.now(),
        event,
      })

      connection.socket.worker.push(["OK", event.id, false, "auth-required:challenge123"])
      vi.advanceTimersByTime(50)

      // Event should still be in pending publishes
      expect(state.pendingPublishes.has(event.id)).toBe(true)
      // And should have been re-sent
      expect(connection.send).toHaveBeenCalledWith(["EVENT", event])
    })

    it("should not re-enqueue AUTH_JOIN events on auth challenge", async () => {
      const event = {id: "event123", kind: AUTH_JOIN} as SignedEvent
      state.pendingPublishes.set(event.id, {
        sent: Date.now(),
        event,
      })

      connection.socket.worker.push(["OK", event.id, false, "auth-required:challenge123"])
      vi.advanceTimersByTime(50)

      // Event should be removed from pending publishes
      expect(state.pendingPublishes.has(event.id)).toBe(false)
      // And should not have been re-sent
      expect(connection.send).not.toHaveBeenCalled()
    })
  })

  describe("notice handling", () => {
    it("should emit notices", async () => {
      const noticeSpy = vi.fn()
      connection.on(ConnectionEvent.Notice, noticeSpy)

      connection.socket.worker.push(["NOTICE", "test notice"])
      vi.advanceTimersByTime(50)

      expect(noticeSpy).toHaveBeenCalledWith(connection, "test notice")
    })

    it("should emit auth-required notice from CLOSED", async () => {
      const noticeSpy = vi.fn()
      connection.on(ConnectionEvent.Notice, noticeSpy)

      connection.socket.worker.push(["CLOSED", "req123", "auth-required:challenge123"])
      vi.advanceTimersByTime(50)

      expect(noticeSpy).toHaveBeenCalledWith(connection, "auth-required:challenge123")
    })
  })

  describe("reconnection behavior", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it("should re-enqueue pending requests on reconnection", async () => {
      const reqId = "req123"
      const filters = [{kinds: [1]}]
      state.pendingRequests.set(reqId, {
        filters,
        sent: Date.now(),
      })

      // Simulate connection close and wait for reconnection delay
      connection.emit(ConnectionEvent.Close, connection)
      await vi.advanceTimersByTimeAsync(10_000)

      expect(connection.send).toHaveBeenCalledWith(["REQ", reqId, ...filters])
    })

    it("should re-enqueue pending publishes on reconnection", async () => {
      const event = {id: "event123", kind: 1} as SignedEvent
      state.pendingPublishes.set(event.id, {
        sent: Date.now(),
        event,
      })

      // Simulate connection close and wait for reconnection delay
      connection.emit(ConnectionEvent.Close, connection)
      await vi.advanceTimersByTimeAsync(10_000)

      expect(connection.send).toHaveBeenCalledWith(["EVENT", event])
    })

    it("should trigger reconnection when there are pending items", async () => {
      const reqId = "req123"
      state.pendingRequests.set(reqId, {
        filters: [],
        sent: Date.now(),
      })

      connection.emit(ConnectionEvent.Close, connection)
      await vi.advanceTimersByTimeAsync(10_000)

      expect(connection.socket.open).toHaveBeenCalled()
    })

    it("should not trigger reconnection when there are no pending items", async () => {
      connection.emit(ConnectionEvent.Close, connection)
      await vi.advanceTimersByTimeAsync(10_000)

      expect(connection.socket.open).not.toHaveBeenCalled()
    })
  })
})
