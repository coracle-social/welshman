import {describe, expect, it, vi, beforeEach, afterEach} from "vitest"
import {Socket, SocketStatus, SocketEvent} from "../src/socket"
import {StampedEvent, CLIENT_AUTH} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {AuthStatus, AuthStateEvent} from "../src/auth"
import {RelayMessage} from "../src/message"

vi.mock("isomorphic-ws", () => {
  const WebSocket = vi.fn(function (this: any) {
    setTimeout(() => this.onopen())
  })

  WebSocket.prototype.send = vi.fn()

  WebSocket.prototype.close = vi.fn(function (this: any) {
    this.onclose()
  })

  return {default: WebSocket}
})

describe("auth", () => {
  let socket: Socket

  beforeEach(() => {
    socket = new Socket("wss://test.relay")
  })

  afterEach(() => {
    vi.clearAllMocks()
    socket.cleanup()
  })

  describe("AuthState", () => {
    it("should initialize with None status", () => {
      expect(socket.auth.status).toBe(AuthStatus.None)
    })

    it("should handle AUTH message from relay", () => {
      const message: RelayMessage = ["AUTH", "challenge123"]
      socket.emit(SocketEvent.Receive, message)

      expect(socket.auth.challenge).toBe("challenge123")
      expect(socket.auth.status).toBe(AuthStatus.Requested)
    })

    it("should handle successful OK message", () => {
      socket.auth.request = "request123"
      const message: RelayMessage = ["OK", "request123", true, "success"]
      socket.emit(SocketEvent.Receive, message)

      expect(socket.auth.status).toBe(AuthStatus.Ok)
      expect(socket.auth.details).toBe("success")
    })

    it("should handle failed OK message", () => {
      socket.auth.request = "request123"
      const message: RelayMessage = ["OK", "request123", false, "forbidden"]
      socket.emit(SocketEvent.Receive, message)

      expect(socket.auth.status).toBe(AuthStatus.Forbidden)
      expect(socket.auth.details).toBe("forbidden")
    })

    it("should ignore OK messages for different requests", () => {
      socket.auth.request = "request123"
      const message: RelayMessage = ["OK", "different-request", true, "success"]
      socket.emit(SocketEvent.Receive, message)

      expect(socket.auth.status).toBe(AuthStatus.None)
    })

    it("should handle client AUTH message", () => {
      const message: RelayMessage = ["AUTH", {id: "123", kind: CLIENT_AUTH}]
      socket.emit(SocketEvent.Sending, message)

      expect(socket.auth.status).toBe(AuthStatus.PendingResponse)
    })

    it("should reset state on socket close", () => {
      socket.auth.challenge = "challenge123"
      socket.auth.request = "request123"
      socket.auth.details = "details"
      socket.auth.status = AuthStatus.PendingResponse

      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      expect(socket.auth.challenge).toBeUndefined()
      expect(socket.auth.request).toBeUndefined()
      expect(socket.auth.details).toBeUndefined()
      expect(socket.auth.status).toBe(AuthStatus.None)
    })

    it("should emit status changes", () => {
      const statusSpy = vi.fn()
      socket.auth.on(AuthStateEvent.Status, statusSpy)

      socket.auth.setStatus(AuthStatus.Requested)

      expect(statusSpy).toHaveBeenCalledWith(AuthStatus.Requested)
    })

    it("should cleanup properly", () => {
      const removeListenersSpy = vi.spyOn(socket.auth, "removeAllListeners")
      socket.auth.cleanup()
      expect(removeListenersSpy).toHaveBeenCalled()
    })
  })

  describe("doAuth", () => {
    it("should throw an error when there is no challenge", async () => {
      const sign = vi.fn()

      await expect(socket.auth.doAuth(sign)).rejects.toThrow(
        "Attempted to authenticate with no challenge",
      )
    })

    it("should throw an error when status is not requested", async () => {
      const sign = vi.fn()

      socket.auth.challenge = "challenge123"
      socket.auth.status = AuthStatus.PendingResponse

      await expect(socket.auth.doAuth(sign)).rejects.toThrow(
        "Attempted to authenticate when auth is already auth:status:pending_response",
      )
    })

    it("should update status when signature fails", async () => {
      const sign = vi.fn()

      socket.auth.challenge = "challenge123"
      socket.auth.status = AuthStatus.Requested

      await socket.auth.doAuth(sign)

      expect(socket.auth.status).toBe(AuthStatus.DeniedSignature)
    })

    it("should send AUTH message", async () => {
      const sendSpy = vi.spyOn(socket, "send")
      let event

      socket.auth.challenge = "challenge123"
      socket.auth.status = AuthStatus.Requested

      const sign = async (e: StampedEvent) => {
        event = await Nip01Signer.ephemeral().sign(e)

        return event
      }

      await socket.auth.doAuth(sign)

      expect(socket.auth.request).toStrictEqual(event!.id)
      expect(sendSpy).toHaveBeenCalledWith(["AUTH", event])
    })
  })
})
