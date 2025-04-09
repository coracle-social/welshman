import {AUTH_JOIN} from "@welshman/util"
import {describe, expect, it, vi, beforeEach, afterEach} from "vitest"
import {Socket, SocketStatus, SocketEvent} from "../src/socket"
import {AuthStatus, AuthStateEvent} from "../src/auth"
import {
  socketPolicyAuthBuffer,
  socketPolicyConnectOnSend,
  socketPolicyCloseOnTimeout,
  socketPolicyReopenActive,
} from "../src/policy"
import {ClientMessage, RelayMessage} from "../src/message"

// Hoist mock definition to top level
const mockWs = vi.hoisted(() => ({
  close: vi.fn(),
  send: vi.fn(),
  onopen: vi.fn(),
  onclose: null,
  onerror: null,
  onmessage: null,
}))

// Mock the WebSocket module
vi.mock("isomorphic-ws", () => ({
  default: mockWs,
}))

describe("policy", () => {
  let socket: Socket

  beforeEach(() => {
    vi.useFakeTimers()
    socket = new Socket("wss://test.relay")
  })

  afterEach(() => {
    socket.cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe("socketPolicyAuthBuffer", () => {
    it("should buffer messages when not authenticated", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const sendSpy = vi.spyOn(socket, "send")

      socket.emit(SocketEvent.Receive, ["AUTH", "challenge"])

      // Regular event should be buffered
      const event: ClientMessage = ["EVENT", {id: "123"}]
      socket.send(event)
      expect(sendSpy).toHaveBeenCalledWith(event)

      // Auth event should not be buffered
      const authEvent: ClientMessage = ["AUTH", {id: "456"}]
      socket.send(authEvent)
      expect(sendSpy).toHaveBeenCalledWith(authEvent)

      // Auth join event should not be buffered
      const joinEvent: ClientMessage = ["EVENT", {id: "789", kind: AUTH_JOIN}]
      socket.send(joinEvent)
      expect(sendSpy).toHaveBeenCalledWith(joinEvent)

      cleanup()
    })

    it("should send buffered messages when auth succeeds", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const sendSpy = vi.spyOn(socket, "send")

      socket.emit(SocketEvent.Receive, ["AUTH", "challenge"])

      // Buffer some messages
      const event1: ClientMessage = ["EVENT", {id: "123"}]
      const event2: ClientMessage = ["EVENT", {id: "456"}]
      socket.send(event1)
      socket.send(event2)

      // Auth succeeds
      socket.send(["AUTH", {id: "auth"}])
      socket.emit(AuthStateEvent.Status, AuthStatus.Ok)

      expect(sendSpy).toHaveBeenCalledWith(event1)
      expect(sendSpy).toHaveBeenCalledWith(event2)

      cleanup()
    })

    it("should handle CLOSE messages properly", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const sendSpy = vi.spyOn(socket, "send")

      socket.emit(SocketEvent.Receive, ["AUTH", "challenge"])

      // Buffer a REQ message
      const req: ClientMessage = ["REQ", "123", {kinds: [1]}]
      socket.send(req)

      // Send CLOSE for buffered REQ
      const close: ClientMessage = ["CLOSE", "123"]
      socket.send(close)

      // Both messages should be sent
      expect(sendSpy).toHaveBeenCalledWith(req)
      expect(sendSpy).toHaveBeenCalledWith(close)

      cleanup()
    })

    it("should retry events once when auth-required", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const recvQueueRemoveSpy = vi.spyOn(socket._recvQueue, "remove")

      // Send an event
      const event: ClientMessage = [
        "EVENT",
        {id: "123", kind: 1, content: "", tags: [], pubkey: "", sig: ""},
      ]
      socket.emit(SocketEvent.Send, event)

      // Receive auth-required rejection
      const authReqMsg: RelayMessage = ["OK", "123", false, "auth-required: need to auth first"]
      socket.emit(SocketEvent.Receiving, authReqMsg)

      // Should remove the auth-required message
      expect(recvQueueRemoveSpy).toHaveBeenCalledWith(authReqMsg)

      // Receive another auth-required rejection
      const authReqMsg2: RelayMessage = ["OK", "123", false, "auth-required: need to auth first"]
      socket.emit(SocketEvent.Receiving, authReqMsg2)

      // Should remove the second auth-required message too
      expect(recvQueueRemoveSpy).toHaveBeenCalledWith(authReqMsg2)

      cleanup()
    })

    it("should retry REQ once when auth-required", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const recvQueueRemoveSpy = vi.spyOn(socket._recvQueue, "remove")

      // Send a REQ
      const req: ClientMessage = ["REQ", "123", {kinds: [1]}]
      socket.emit(SocketEvent.Send, req)

      // Receive auth-required rejection
      const authReqMsg: RelayMessage = ["OK", "123", false, "auth-required: need to auth first"]
      socket.emit(SocketEvent.Receiving, authReqMsg)

      // Should remove the auth-required message
      expect(recvQueueRemoveSpy).toHaveBeenCalledWith(authReqMsg)

      // Receive another auth-required rejection
      const authReqMsg2: RelayMessage = ["OK", "123", false, "auth-required: need to auth first"]
      socket.emit(SocketEvent.Receiving, authReqMsg2)

      // Should remove the second auth-required message too
      expect(recvQueueRemoveSpy).toHaveBeenCalledWith(authReqMsg2)

      cleanup()
    })

    it("should not retry AUTH_JOIN events", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const sendSpy = vi.spyOn(socket, "send")

      // Send an AUTH_JOIN event
      const event: ClientMessage = [
        "EVENT",
        {id: "123", kind: AUTH_JOIN, content: "", tags: [], pubkey: "", sig: ""},
      ]
      socket.emit(SocketEvent.Send, event)

      // Receive auth-required rejection
      socket.emit(SocketEvent.Receive, ["OK", "123", false, "auth-required: need to auth first"])

      // Should not retry AUTH_JOIN events
      expect(sendSpy).not.toHaveBeenCalled()

      cleanup()
    })

    it("should clear pending messages on successful response", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const sendSpy = vi.spyOn(socket, "send")

      // Send an event
      const event: ClientMessage = [
        "EVENT",
        {id: "123", kind: 1, content: "", tags: [], pubkey: "", sig: ""},
      ]
      socket.emit(SocketEvent.Send, event)

      // Receive successful response
      socket.emit(SocketEvent.Receive, ["OK", "123", true, ""])

      // Receive auth-required rejection (should not trigger retry since message was cleared)
      socket.emit(SocketEvent.Receive, ["OK", "123", false, "auth-required: need to auth first"])

      // Should not retry
      expect(sendSpy).not.toHaveBeenCalled()

      cleanup()
    })
  })

  describe("socketPolicyConnectOnSend", () => {
    it("should open socket on send when closed", () => {
      const cleanup = socketPolicyConnectOnSend(socket)
      const openSpy = vi.spyOn(socket, "open")

      // Socket starts closed
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Send a message
      const event: ClientMessage = ["EVENT", {id: "123", kind: 1}]
      socket.emit(SocketEvent.Sending, event)

      // Should open the socket
      expect(openSpy).toHaveBeenCalled()

      cleanup()
    })

    it("should not open socket if already open", () => {
      const cleanup = socketPolicyConnectOnSend(socket)
      const openSpy = vi.spyOn(socket, "open")

      // Socket is open
      socket.emit(SocketEvent.Status, SocketStatus.Open)

      // Send a message
      const event: ClientMessage = ["EVENT", {id: "123", kind: 1}]
      socket.emit(SocketEvent.Sending, event)

      // Should not try to open the socket
      expect(openSpy).not.toHaveBeenCalled()

      cleanup()
    })

    it("should not open socket if there was a recent error", () => {
      const cleanup = socketPolicyConnectOnSend(socket)
      const openSpy = vi.spyOn(socket, "open")

      // Socket has an error
      socket.emit(SocketEvent.Status, SocketStatus.Error)
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Send a message
      const event: ClientMessage = ["EVENT", {id: "123", kind: 1}]
      socket.emit(SocketEvent.Sending, event)

      // Should not try to open the socket due to recent error
      expect(openSpy).not.toHaveBeenCalled()

      // Advance time past the error timeout
      vi.advanceTimersByTime(31000)

      // Send another message
      socket.emit(SocketEvent.Sending, event)

      // Now it should try to open
      expect(openSpy).toHaveBeenCalled()

      cleanup()
    })
  })

  describe("socketPolicyCloseOnTimeout", () => {
    it("should close socket after 30 seconds of inactivity", async () => {
      const cleanup = socketPolicyCloseOnTimeout(socket)
      const closeSpy = vi.spyOn(socket, "close")

      // Set socket as open
      socket.emit(SocketEvent.Status, SocketStatus.Open)

      // Advance time past the timeout
      await vi.advanceTimersByTimeAsync(35000)

      // Socket should be closed
      expect(closeSpy).toHaveBeenCalled()

      cleanup()
    })

    it("should reset timer on send activity", () => {
      const cleanup = socketPolicyCloseOnTimeout(socket)
      const closeSpy = vi.spyOn(socket, "close")

      // Set socket as open
      socket.emit(SocketEvent.Status, SocketStatus.Open)

      // Advance time partially
      vi.advanceTimersByTime(20000)

      // Send a message
      socket.emit(SocketEvent.Send, ["EVENT", {id: "123"}])

      // Advance time partially again
      vi.advanceTimersByTime(20000)

      // Socket should not be closed yet
      expect(closeSpy).not.toHaveBeenCalled()

      // Advance remaining time
      vi.advanceTimersByTime(11000)

      // Now socket should be closed
      expect(closeSpy).toHaveBeenCalled()

      cleanup()
    })

    it("should reset timer on receive activity", () => {
      const cleanup = socketPolicyCloseOnTimeout(socket)
      const closeSpy = vi.spyOn(socket, "close")

      // Set socket as open
      socket.emit(SocketEvent.Status, SocketStatus.Open)

      // Advance time partially
      vi.advanceTimersByTime(20000)

      // Receive a message
      socket.emit(SocketEvent.Receive, ["EVENT", "123", {id: "123"}])

      // Advance time partially again
      vi.advanceTimersByTime(20000)

      // Socket should not be closed yet
      expect(closeSpy).not.toHaveBeenCalled()

      // Advance remaining time
      vi.advanceTimersByTime(11000)

      // Now socket should be closed
      expect(closeSpy).toHaveBeenCalled()

      cleanup()
    })

    it("should not close socket if not open", () => {
      const cleanup = socketPolicyCloseOnTimeout(socket)
      const closeSpy = vi.spyOn(socket, "close")

      // Set socket as closed
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Advance time past the timeout
      vi.advanceTimersByTime(31000)

      // Socket should not be closed
      expect(closeSpy).not.toHaveBeenCalled()

      cleanup()
    })
  })

  describe("socketPolicyReopenActive", () => {
    it("should reopen socket when closed with pending messages", async () => {
      const cleanup = socketPolicyReopenActive(socket)
      const sendSpy = vi.spyOn(socket, "send")

      // Send an event that will be pending
      const event: ClientMessage = ["EVENT", {id: "123", kind: 1}]
      socket.emit(SocketEvent.Send, event)

      // Socket closes
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Advance past the reopen delay
      await vi.advanceTimersByTimeAsync(30000)

      // Should resend the pending event
      expect(sendSpy).toHaveBeenCalledWith(event)

      cleanup()
    })

    it("should reopen socket when closed with pending requests", async () => {
      const cleanup = socketPolicyReopenActive(socket)
      const sendSpy = vi.spyOn(socket, "send")

      // Send a request that will be pending
      const req: ClientMessage = ["REQ", "123", {kinds: [1]}]
      socket.emit(SocketEvent.Send, req)

      // Socket closes
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Advance past the reopen delay
      await vi.advanceTimersByTimeAsync(30000)

      // Should resend the pending request
      expect(sendSpy).toHaveBeenCalledWith(req)

      cleanup()
    })

    it("should not reopen socket immediately after previous open", async () => {
      const cleanup = socketPolicyReopenActive(socket)
      const sendSpy = vi.spyOn(socket, "send")

      // Send an event that will be pending
      const event: ClientMessage = ["EVENT", {id: "123", kind: 1}]
      socket.emit(SocketEvent.Send, event)

      // Socket opens then closes quickly
      socket.emit(SocketEvent.Status, SocketStatus.Open)
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Advance a short time
      vi.advanceTimersByTime(5000)

      // Should not resend yet to prevent flapping
      expect(sendSpy).not.toHaveBeenCalled()

      // Advance remaining time
      await vi.advanceTimersByTimeAsync(25000)

      // Now should resend
      expect(sendSpy).toHaveBeenCalledWith(event)

      cleanup()
    })

    it("should remove pending messages when they complete", () => {
      const cleanup = socketPolicyReopenActive(socket)
      const sendSpy = vi.spyOn(socket, "send")

      // Send an event that will be pending
      const event: ClientMessage = ["EVENT", {id: "123", kind: 1}]
      socket.emit(SocketEvent.Send, event)

      // Event completes successfully
      socket.emit(SocketEvent.Receive, ["OK", "123", true])

      // Socket closes
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Advance past the reopen delay
      vi.advanceTimersByTime(30000)

      // Should not resend since event was completed
      expect(sendSpy).not.toHaveBeenCalled()

      cleanup()
    })

    it("should remove pending messages when closed", () => {
      const cleanup = socketPolicyReopenActive(socket)
      const sendSpy = vi.spyOn(socket, "send")

      // Send a request that will be pending
      const req: ClientMessage = ["REQ", "123", {kinds: [1]}]
      socket.emit(SocketEvent.Send, req)

      // Send close for the request
      const close: ClientMessage = ["CLOSE", "123"]
      socket.emit(SocketEvent.Send, close)

      // Socket closes
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Advance past the reopen delay
      vi.advanceTimersByTime(30000)

      // Should not resend since request was closed
      expect(sendSpy).not.toHaveBeenCalled()

      cleanup()
    })
  })
})
