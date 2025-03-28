import { AUTH_JOIN } from "@welshman/util"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { Socket, SocketStatus, SocketEventType } from "../src/socket"
import { AuthStatus, AuthStateEventType } from "../src/auth"
import {
  socketPolicySendWhenOpen,
  socketPolicyDeferOnAuth,
  socketPolicyRetryAuthRequired,
  socketPolicyConnectOnSend,
  socketPolicyCloseOnTimeout,
  socketPolicyReopenActive
} from "../src/policy"
import { ClientMessage, RelayMessage } from "../src/message"

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
vi.mock('isomorphic-ws', () => ({
  default: mockWs
}))

describe('policy', () => {
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

  describe("socketPolicyDeferOnAuth", () => {
    it("should buffer messages when not authenticated", () => {
      const cleanup = socketPolicyDeferOnAuth(socket)
      const removeSpy = vi.spyOn(socket._sendQueue, 'remove')

      socket.emit(SocketEventType.Receive, ["AUTH", "challenge"])

      // Regular event should be buffered
      const event: ClientMessage = ["EVENT", { id: "123"}]
      socket.send(event)
      expect(removeSpy).toHaveBeenCalledWith(event)

      // Auth event should not be buffered
      const authEvent: ClientMessage = ["AUTH", { id: "456" }]
      socket.send(authEvent)
      expect(removeSpy).not.toHaveBeenCalledWith(authEvent)

      // Auth join event should not be buffered
      const joinEvent: ClientMessage = ["EVENT", { id: "789", kind: AUTH_JOIN }]
      socket.send(joinEvent)
      expect(removeSpy).not.toHaveBeenCalledWith(joinEvent)

      cleanup()
    })

    it("should send buffered messages when auth succeeds", () => {
      const cleanup = socketPolicyDeferOnAuth(socket)
      const sendSpy = vi.spyOn(socket, 'send')

      socket.emit(SocketEventType.Receive, ["AUTH", "challenge"])

      // Buffer some messages
      const event1: ClientMessage = ["EVENT", { id: "123"}]
      const event2: ClientMessage = ["EVENT", { id: "456"}]
      socket.send(event1)
      socket.send(event2)

      // Auth succeeds
      socket.send(["AUTH", { id: "auth" }])
      socket.emit(AuthStateEventType.Status, AuthStatus.Ok)

      expect(sendSpy).toHaveBeenCalledWith(event1)
      expect(sendSpy).toHaveBeenCalledWith(event2)

      cleanup()
    })

    it("should handle CLOSE messages properly", () => {
      const cleanup = socketPolicyDeferOnAuth(socket)
      const removeSpy = vi.spyOn(socket._sendQueue, 'remove')

      socket.emit(SocketEventType.Receive, ["AUTH", "challenge"])

      // Buffer a REQ message
      const req: ClientMessage = ["REQ", "123", { kinds: [1] }]
      socket.send(req)

      // Send CLOSE for buffered REQ
      const close: ClientMessage = ["CLOSE", "123"]
      socket.send(close)

      // Both messages should be removed
      expect(removeSpy).toHaveBeenCalledWith(req)
      expect(removeSpy).toHaveBeenCalledWith(close)

      cleanup()
    })
  })

  describe("socketPolicyRetryAuthRequired", () => {
    it("should retry events once when auth-required", () => {
      const cleanup = socketPolicyRetryAuthRequired(socket)
      const sendSpy = vi.spyOn(socket, 'send')

      // Send an event
      const event: ClientMessage = ["EVENT", { id: "123", kind: 1, content: "", tags: [], pubkey: "", sig: "" }]
      socket.emit(SocketEventType.Send, event)

      // Receive auth-required rejection
      socket.emit(SocketEventType.Receive, ["OK", "123", false, "auth-required: need to auth first"])

      // Should retry the event
      expect(sendSpy).toHaveBeenCalledWith(event)

      // Receive another auth-required rejection
      socket.emit(SocketEventType.Receive, ["OK", "123", false, "auth-required: need to auth first"])

      // Should not retry again
      expect(sendSpy).toHaveBeenCalledTimes(1)

      cleanup()
    })

    it("should retry REQ once when auth-required", () => {
      const cleanup = socketPolicyRetryAuthRequired(socket)
      const sendSpy = vi.spyOn(socket, 'send')

      // Send a REQ
      const req: ClientMessage = ["REQ", "123", { kinds: [1] }]
      socket.emit(SocketEventType.Send, req)

      // Receive auth-required rejection via CLOSED
      socket.emit(SocketEventType.Receive, ["CLOSED", "123", "auth-required: need to auth first"])

      // Should retry the request
      expect(sendSpy).toHaveBeenCalledWith(req)

      // Receive another auth-required rejection
      socket.emit(SocketEventType.Receive, ["CLOSED", "123", "auth-required: need to auth first"])

      // Should not retry again
      expect(sendSpy).toHaveBeenCalledTimes(1)

      cleanup()
    })

    it("should not retry AUTH_JOIN events", () => {
      const cleanup = socketPolicyRetryAuthRequired(socket)
      const sendSpy = vi.spyOn(socket, 'send')

      // Send an AUTH_JOIN event
      const event: ClientMessage = ["EVENT", { id: "123", kind: AUTH_JOIN, content: "", tags: [], pubkey: "", sig: "" }]
      socket.emit(SocketEventType.Send, event)

      // Receive auth-required rejection
      socket.emit(SocketEventType.Receive, ["OK", "123", false, "auth-required: need to auth first"])

      // Should not retry AUTH_JOIN events
      expect(sendSpy).not.toHaveBeenCalled()

      cleanup()
    })

    it("should clear pending messages on successful response", () => {
      const cleanup = socketPolicyRetryAuthRequired(socket)
      const sendSpy = vi.spyOn(socket, 'send')

      // Send an event
      const event: ClientMessage = ["EVENT", { id: "123", kind: 1, content: "", tags: [], pubkey: "", sig: "" }]
      socket.emit(SocketEventType.Send, event)

      // Receive successful response
      socket.emit(SocketEventType.Receive, ["OK", "123", true, ""])

      // Receive auth-required rejection (should not trigger retry since message was cleared)
      socket.emit(SocketEventType.Receive, ["OK", "123", false, "auth-required: need to auth first"])

      // Should not retry
      expect(sendSpy).not.toHaveBeenCalled()

      cleanup()
    })
  })

  describe("socketPolicyConnectOnSend", () => {
    it("should open socket on send when closed", () => {
      const cleanup = socketPolicyConnectOnSend(socket)
      const openSpy = vi.spyOn(socket, 'open')

      // Socket starts closed
      socket.emit(SocketEventType.Status, SocketStatus.Closed)

      // Send a message
      const event: ClientMessage = ["EVENT", { id: "123", kind: 1 }]
      socket.emit(SocketEventType.Enqueue, event)

      // Should open the socket
      expect(openSpy).toHaveBeenCalled()

      cleanup()
    })

    it("should not open socket if already open", () => {
      const cleanup = socketPolicyConnectOnSend(socket)
      const openSpy = vi.spyOn(socket, 'open')

      // Socket is open
      socket.emit(SocketEventType.Status, SocketStatus.Open)

      // Send a message
      const event: ClientMessage = ["EVENT", { id: "123", kind: 1 }]
      socket.emit(SocketEventType.Enqueue, event)

      // Should not try to open the socket
      expect(openSpy).not.toHaveBeenCalled()

      cleanup()
    })

    it("should not open socket if there was a recent error", () => {
      const cleanup = socketPolicyConnectOnSend(socket)
      const openSpy = vi.spyOn(socket, 'open')

      // Socket has an error
      socket.emit(SocketEventType.Status, SocketStatus.Error)
      socket.emit(SocketEventType.Status, SocketStatus.Closed)

      // Send a message
      const event: ClientMessage = ["EVENT", { id: "123", kind: 1 }]
      socket.emit(SocketEventType.Enqueue, event)

      // Should not try to open the socket due to recent error
      expect(openSpy).not.toHaveBeenCalled()

      // Advance time past the error timeout
      vi.advanceTimersByTime(31000)

      // Send another message
      socket.emit(SocketEventType.Enqueue, event)

      // Now it should try to open
      expect(openSpy).toHaveBeenCalled()

      cleanup()
    })
  })

  describe("socketPolicyCloseOnTimeout", () => {
  })
})
