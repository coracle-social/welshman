import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { Socket, SocketStatus, SocketEvent } from "../src/socket"
import { makeEvent, CLIENT_AUTH } from "@welshman/util"
import { Nip01Signer } from "@welshman/signer"
import { AuthState, AuthStatus, AuthStateEvent, AuthManager, makeAuthEvent } from "../src/auth"
import EventEmitter from "events"
import { RelayMessage } from "../src/message"

vi.mock('isomorphic-ws', () => {
  const WebSocket = vi.fn(function () {
    setTimeout(() => this.onopen())
  })

  WebSocket.prototype.send = vi.fn()

  WebSocket.prototype.close = vi.fn(function () {
    this.onclose()
  })

  return { default: WebSocket }
})

describe('auth', () => {
  let socket: Socket
  let authManager: AuthManager
  let sign = vi.fn(Nip01Signer.ephemeral().sign)

  beforeEach(() => {
    socket = new Socket('wss://test.relay')
    authManager = new AuthManager(socket, { sign })
  })

  afterEach(() => {
    vi.clearAllMocks()
    socket.cleanup()
    authManager.cleanup()
  })

  describe("AuthState", () => {
    it("should initialize with None status", () => {
      expect(authManager.state.status).toBe(AuthStatus.None)
    })

    it("should handle AUTH message from relay", () => {
      const message: RelayMessage = ["AUTH", "challenge123"]
      socket.emit(SocketEvent.Receive, message)

      expect(authManager.state.challenge).toBe("challenge123")
      expect(authManager.state.status).toBe(AuthStatus.Requested)
    })

    it("should handle successful OK message", () => {
      authManager.state.request = "request123"
      const message: RelayMessage = ["OK", "request123", true, "success"]
      socket.emit(SocketEvent.Receive, message)

      expect(authManager.state.status).toBe(AuthStatus.Ok)
      expect(authManager.state.details).toBe("success")
    })

    it("should handle failed OK message", () => {
      authManager.state.request = "request123"
      const message: RelayMessage = ["OK", "request123", false, "forbidden"]
      socket.emit(SocketEvent.Receive, message)

      expect(authManager.state.status).toBe(AuthStatus.Forbidden)
      expect(authManager.state.details).toBe("forbidden")
    })

    it("should ignore OK messages for different requests", () => {
      authManager.state.request = "request123"
      const message: RelayMessage = ["OK", "different-request", true, "success"]
      socket.emit(SocketEvent.Receive, message)

      expect(authManager.state.status).toBe(AuthStatus.None)
    })

    it("should handle client AUTH message", () => {
      const message: RelayMessage = ["AUTH", { id: "123", kind: CLIENT_AUTH }]
      socket.emit(SocketEvent.Sending, message)

      expect(authManager.state.status).toBe(AuthStatus.PendingResponse)
    })

    it("should reset state on socket close", () => {
      authManager.state.challenge = "challenge123"
      authManager.state.request = "request123"
      authManager.state.details = "details"
      authManager.state.status = AuthStatus.PendingResponse

      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      expect(authManager.state.challenge).toBeUndefined()
      expect(authManager.state.request).toBeUndefined()
      expect(authManager.state.details).toBeUndefined()
      expect(authManager.state.status).toBe(AuthStatus.None)
    })

    it("should emit status changes", () => {
      const statusSpy = vi.fn()
      authManager.state.on(AuthStateEvent.Status, statusSpy)

      authManager.state.setStatus(AuthStatus.Requested)

      expect(statusSpy).toHaveBeenCalledWith(AuthStatus.Requested)
    })

    it("should cleanup properly", () => {
      const removeListenersSpy = vi.spyOn(authManager.state, "removeAllListeners")
      authManager.state.cleanup()
      expect(removeListenersSpy).toHaveBeenCalled()
    })
  })

  describe("AuthManager", () => {
    it("should create AuthState instance", () => {
      expect(authManager.state).toBeInstanceOf(AuthState)
    })

    it("should respond automatically when eager is true", () => {
      const respondSpy = vi.spyOn(AuthManager.prototype, "respond")
      const eagerManager = new AuthManager(socket, { sign, eager: true })

      socket.emit(SocketEvent.Receive, ["AUTH", "challenge123"])

      expect(respondSpy).toHaveBeenCalled()
    })

    it("should not respond automatically when eager is false", () => {
      const respondSpy = vi.spyOn(AuthManager.prototype, "respond")
      socket.emit(SocketEvent.Receive, ["AUTH", "challenge123"])

      expect(respondSpy).not.toHaveBeenCalled()
    })

    describe("respond", () => {
      it("should throw error if no challenge", async () => {
        await expect(authManager.respond()).rejects.toThrow("Attempted to authenticate with no challenge")
      })

      it("should throw error if status is not Requested", async () => {
        authManager.state.challenge = "challenge123"
        authManager.state.status = AuthStatus.PendingSignature

        await expect(authManager.respond()).rejects.toThrow("Attempted to authenticate when auth is already auth:status:pending_signature")
      })

      it("should handle successful sign", async () => {
        const sendSpy = vi.spyOn(socket, 'send')

        authManager.state.challenge = "challenge123"
        authManager.state.status = AuthStatus.Requested
        const signedEvent = { id: "signed-event-id", kind: CLIENT_AUTH }
        sign.mockResolvedValue(signedEvent)

        await authManager.respond()

        expect(authManager.state.request).toBe("signed-event-id")
        expect(sendSpy).toHaveBeenCalledWith(["AUTH", signedEvent])
      })

      it("should handle denied signature", async () => {
        const sendSpy = vi.spyOn(socket, 'send')

        authManager.state.challenge = "challenge123"
        authManager.state.status = AuthStatus.Requested
        sign.mockResolvedValue(null)

        await authManager.respond()

        expect(authManager.state.status).toBe(AuthStatus.DeniedSignature)
        expect(sendSpy).not.toHaveBeenCalled()
      })
    })

    describe("attempt", () => {
      it("should attempt to open socket", async () => {
        const attemptToOpenSpy = vi.spyOn(socket, 'attemptToOpen')
        await authManager.attempt()
        expect(attemptToOpenSpy).toHaveBeenCalled()
      })

      it("should wait for challenge", async () => {
        const waitForChallengeSpy = vi.spyOn(authManager, "waitForChallenge")
        await authManager.attempt()
        expect(waitForChallengeSpy).toHaveBeenCalled()
      })

      it("should respond if challenge received", async () => {
        const respondSpy = vi.spyOn(authManager, "respond")
        authManager.state.challenge = "challenge123"
        authManager.state.status = AuthStatus.Requested
        await authManager.attempt()
        expect(respondSpy).toHaveBeenCalled()
      })

      it("should wait for resolution", async () => {
        const waitForResolutionSpy = vi.spyOn(authManager, "waitForResolution")
        await authManager.attempt()
        expect(waitForResolutionSpy).toHaveBeenCalled()
      })
    })
  })
})
