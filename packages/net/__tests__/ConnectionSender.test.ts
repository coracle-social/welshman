import {ConnectionSender} from "../src/ConnectionSender"
import {Connection} from "../src/Connection"
import {Message, SocketStatus} from "../src/Socket"
import {AuthStatus} from "../src/ConnectionAuth"
import {AUTH_JOIN} from "@welshman/util"
import {vi, describe, it, expect, beforeEach, afterEach} from "vitest"

describe("ConnectionSender", () => {
  let connection: Connection
  let sender: ConnectionSender

  beforeEach(() => {
    vi.useFakeTimers()
    connection = new Connection("wss://test.relay/")
    connection.socket.send = vi.fn().mockResolvedValue(undefined)
    connection.socket.open = vi.fn().mockResolvedValue(undefined)
    connection.socket.status = SocketStatus.Open
    connection.send = vi.fn().mockResolvedValue(undefined)

    sender = connection.sender
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("message deferral", () => {
    it("should not defer CLOSE messages", async () => {
      // First send a REQ message to set up the pending request
      const reqId = "subscription-id"
      sender.push([
        "REQ",
        reqId,
        {
          /* filters */
        },
      ] as Message)
      const message: Message = ["CLOSE", reqId]
      // there is a setTimeout in the worker, so we need to advance timers
      vi.advanceTimersByTime(50)
      sender.push(message)
      // there is a setTimeout in the worker, so we need to advance timers
      vi.advanceTimersByTime(50)
      expect(connection.socket.send).toHaveBeenCalledWith(message)
    })

    it("should defer messages when socket is not open", () => {
      connection.socket.status = SocketStatus.Closed
      const message: Message = [
        "EVENT",
        {
          /* event data */
        },
      ]
      sender.push(message)
      expect(connection.socket.send).not.toHaveBeenCalled()
      expect(sender.worker.buffer).toContain(message)
    })

    it("should not defer AUTH messages", () => {
      const message: Message = [
        "AUTH",
        {
          /* auth data */
        },
      ]
      sender.push(message)
      // there is a setTimeout in the worker, so we need to advance timers
      vi.advanceTimersByTime(50)
      expect(connection.socket.send).toHaveBeenCalledWith(message)
    })

    it("should not defer AUTH_JOIN event messages", () => {
      const message: Message = ["EVENT", {kind: AUTH_JOIN}]
      sender.push(message)
      // there is a setTimeout in the worker, so we need to advance timers
      vi.advanceTimersByTime(50)
      expect(connection.socket.send).toHaveBeenCalledWith(message)
    })

    it("should defer messages when auth is pending", () => {
      connection.socket.status = SocketStatus.Open
      connection.auth.status = AuthStatus.PendingResponse
      const message: Message = [
        "EVENT",
        {
          /* event data */
        },
      ]
      sender.push(message)
      vi.advanceTimersByTime(50)
      expect(connection.socket.send).not.toHaveBeenCalled()
      expect(sender.worker.buffer).toContain(message)
    })

    it("should defer REQ messages when too many pending requests", () => {
      connection.socket.status = SocketStatus.Open
      connection.auth.status = AuthStatus.Ok
      // Set up 8 pending requests
      for (let i = 0; i < 8; i++) {
        connection.state.pendingRequests.set(`req${i}`, {
          filters: [],
          sent: Date.now(),
        })
      }

      const message: Message = [
        "REQ",
        "newReq",
        {
          /* filter */
        },
      ]
      sender.push(message)
      vi.advanceTimersByTime(50)
      expect(connection.socket.send).not.toHaveBeenCalled()
      expect(sender.worker.buffer).toContain(message)
    })
  })

  describe("message handling", () => {
    it("should send messages when conditions are met", () => {
      connection.socket.status = SocketStatus.Open
      connection.auth.status = AuthStatus.Ok
      const message: Message = [
        "EVENT",
        {
          /* event data */
        },
      ]
      sender.push(message)
      vi.advanceTimersByTime(50)
      expect(connection.socket.send).toHaveBeenCalledWith(message)
    })

    it("should handle CLOSE messages for non-existent requests", () => {
      const message: Message = ["CLOSE", "non-existent-req"]
      sender.push(message)
      expect(connection.socket.send).not.toHaveBeenCalled()
    })

    it("should remove pending REQ when handling CLOSE", () => {
      const reqId = "req123"
      const reqMessage: Message = [
        "REQ",
        reqId,
        {
          /* filter */
        },
      ]
      sender.worker.buffer.push(reqMessage)

      const closeMessage: Message = ["CLOSE", reqId]
      sender.push(closeMessage)

      expect(sender.worker.buffer).not.toContain(reqMessage)
    })
  })

  describe("worker behavior", () => {
    it("should process deferred messages when conditions become favorable", async () => {
      connection.socket.status = SocketStatus.Closed
      const message: Message = [
        "EVENT",
        {
          /* event data */
        },
      ]
      sender.push(message)
      vi.advanceTimersByTime(50)
      expect(connection.socket.send).not.toHaveBeenCalled()

      // Simulate socket opening and auth completing
      connection.socket.status = SocketStatus.Open
      connection.auth.status = AuthStatus.Ok

      // Trigger worker processing
      sender.worker.resume()
      vi.advanceTimersByTime(50)
      expect(connection.socket.send).toHaveBeenCalledWith(message)
    })

    it("should maintain message order", async () => {
      connection.socket.status = SocketStatus.Open
      connection.auth.status = AuthStatus.Ok

      const messages: Message[] = [
        ["EVENT", {id: "1"}],
        ["EVENT", {id: "2"}],
        ["EVENT", {id: "3"}],
      ]

      messages.forEach(msg => sender.push(msg))
      vi.advanceTimersByTime(50)

      const sendCalls = connection.socket.send.mock.calls
      expect(sendCalls.map(call => call[0])).toEqual(messages)
    })
  })
})
