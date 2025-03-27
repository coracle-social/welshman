import WebSocket from "isomorphic-ws"
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

describe('policy', () => {
  let socket: Socket
  let mockWs: any

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    mockWs = {
      close: vi.fn(),
      send: vi.fn(),
      onopen: vi.fn(),
      onclose: null,
      onerror: null,
      onmessage: null,
    }

    vi.mock('@/store', () => ({default: mockWs}))

    socket = new Socket("wss://test.relay")
  })

  afterEach(() => {
    socket.cleanup()
    vi.useRealTimers()
  })

  describe("socketPolicySendWhenOpen", () => {
    it("should send when open", async () => {
      const cleanup = socketPolicySendWhenOpen(socket)
      const stopSpy = vi.spyOn(socket._sendQueue, 'stop')
      const startSpy = vi.spyOn(socket._sendQueue, 'start')

      socket.emit(SocketEventType.Status, SocketStatus.Opening, socket.url)

      expect(stopSpy).toHaveBeenCalled()
      expect(startSpy).not.toHaveBeenCalled()

      socket.emit(SocketEventType.Status, SocketStatus.Open, socket.url)

      expect(startSpy).toHaveBeenCalled()

      cleanup()
    })
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
})
