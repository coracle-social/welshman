import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { Socket, SocketStatus, SocketEventType } from "../src/socket"
import { makeEvent, CLIENT_AUTH } from "@welshman/util"
import { AuthState, AuthStatus, AuthStateEventType, AuthManager, makeAuthEvent } from "../src/auth"
import EventEmitter from "events"
import { RelayMessage } from "../src/message"

// Mock dependencies
vi.mock("@welshman/lib", () => ({
  on: (target: any, eventName: string, callback: Function) => {
    target.on(eventName, callback)
    return () => target.off(eventName, callback)
  },
  call: (fn: Function) => fn(),
  sleep: vi.fn()
}))

vi.mock("@welshman/util", () => ({
  makeEvent: vi.fn((kind, opts) => ({
    kind,
    id: "test-event-id",
    ...opts
  })),
  CLIENT_AUTH: 24242
}))

describe("AuthState", () => {
  let socket: Socket & EventEmitter
  let authState: AuthState

  beforeEach(() => {
    const mockSocket = new EventEmitter()
    Object.assign(mockSocket, {
      url: "wss://test.relay",
      send: vi.fn(),
      removeAllListeners: vi.fn()
    })
    socket = mockSocket as unknown as Socket
    authState = new AuthState(socket)
  })

  afterEach(() => {
    authState.cleanup()
    vi.clearAllMocks()
  })

  it("should initialize with None status", () => {
    expect(authState.status).toBe(AuthStatus.None)
  })

  it("should handle AUTH message from relay", () => {
    const message: RelayMessage = ["AUTH", "challenge123"]
    socket.emit(SocketEventType.Receive, message)

    expect(authState.challenge).toBe("challenge123")
    expect(authState.status).toBe(AuthStatus.Requested)
  })

  it("should handle successful OK message", () => {
    authState.request = "request123"
    const message: RelayMessage = ["OK", "request123", true, "success"]
    socket.emit(SocketEventType.Receive, message)

    expect(authState.status).toBe(AuthStatus.Ok)
    expect(authState.details).toBe("success")
  })

  it("should handle failed OK message", () => {
    authState.request = "request123"
    const message: RelayMessage = ["OK", "request123", false, "forbidden"]
    socket.emit(SocketEventType.Receive, message)

    expect(authState.status).toBe(AuthStatus.Forbidden)
    expect(authState.details).toBe("forbidden")
  })

  it("should ignore OK messages for different requests", () => {
    authState.request = "request123"
    const message: RelayMessage = ["OK", "different-request", true, "success"]
    socket.emit(SocketEventType.Receive, message)

    expect(authState.status).toBe(AuthStatus.None)
  })

  it("should handle client AUTH message", () => {
    const message: RelayMessage = ["AUTH", { id: "123", kind: CLIENT_AUTH }]
    socket.emit(SocketEventType.Enqueue, message)

    expect(authState.status).toBe(AuthStatus.PendingResponse)
  })

  it("should reset state on socket close", () => {
    authState.challenge = "challenge123"
    authState.request = "request123"
    authState.details = "details"
    authState.status = AuthStatus.PendingResponse

    socket.emit(SocketEventType.Status, SocketStatus.Closed)

    expect(authState.challenge).toBeUndefined()
    expect(authState.request).toBeUndefined()
    expect(authState.details).toBeUndefined()
    expect(authState.status).toBe(AuthStatus.None)
  })

  it("should emit status changes", () => {
    const statusSpy = vi.fn()
    authState.on(AuthStateEventType.Status, statusSpy)

    authState.setStatus(AuthStatus.Requested)

    expect(statusSpy).toHaveBeenCalledWith(AuthStatus.Requested)
  })

  it("should cleanup properly", () => {
    const removeListenersSpy = vi.spyOn(authState, "removeAllListeners")
    authState.cleanup()
    expect(removeListenersSpy).toHaveBeenCalled()
  })
})

describe("AuthManager", () => {
  let socket: Socket & EventEmitter
  let manager: AuthManager
  let signFn: jest.Mock

  beforeEach(() => {
    const mockSocket = new EventEmitter()
    Object.assign(mockSocket, {
      url: "wss://test.relay",
      send: vi.fn(),
      removeAllListeners: vi.fn(),
      attemptToOpen: vi.fn()
    })
    socket = mockSocket as unknown as Socket & EventEmitter
    signFn = vi.fn()
    manager = new AuthManager(socket, { sign: signFn })
  })

  afterEach(() => {
    manager.cleanup()
    vi.clearAllMocks()
  })

  it("should create AuthState instance", () => {
    expect(manager.state).toBeInstanceOf(AuthState)
  })

  it("should respond automatically when eager is true", () => {
    const respondSpy = vi.spyOn(AuthManager.prototype, "respond")
    const eagerManager = new AuthManager(socket, { sign: signFn, eager: true })

    socket.emit(SocketEventType.Receive, ["AUTH", "challenge123"])

    expect(respondSpy).toHaveBeenCalled()
  })

  it("should not respond automatically when eager is false", () => {
    const respondSpy = vi.spyOn(AuthManager.prototype, "respond")
    socket.emit(SocketEventType.Receive, ["AUTH", "challenge123"])

    expect(respondSpy).not.toHaveBeenCalled()
  })

  describe("respond", () => {
    it("should throw error if no challenge", async () => {
      await expect(manager.respond()).rejects.toThrow("Attempted to authenticate with no challenge")
    })

    it("should throw error if status is not Requested", async () => {
      manager.state.challenge = "challenge123"
      manager.state.status = AuthStatus.PendingSignature

      await expect(manager.respond()).rejects.toThrow("Attempted to authenticate when auth is already auth:status:pending_signature")
    })

    it("should handle successful sign", async () => {
      manager.state.challenge = "challenge123"
      manager.state.status = AuthStatus.Requested
      const signedEvent = { id: "signed-event-id", kind: CLIENT_AUTH }
      signFn.mockResolvedValue(signedEvent)

      await manager.respond()

      expect(manager.state.request).toBe("signed-event-id")
      expect(socket.send).toHaveBeenCalledWith(["AUTH", signedEvent])
    })

    it("should handle denied signature", async () => {
      manager.state.challenge = "challenge123"
      manager.state.status = AuthStatus.Requested
      signFn.mockResolvedValue(null)

      await manager.respond()

      expect(manager.state.status).toBe(AuthStatus.DeniedSignature)
      expect(socket.send).not.toHaveBeenCalled()
    })
  })

  describe("attempt", () => {
    it("should attempt to open socket", async () => {
      await manager.attempt()
      expect(socket.attemptToOpen).toHaveBeenCalled()
    })

    it("should wait for challenge", async () => {
      const waitForChallengeSpy = vi.spyOn(manager, "waitForChallenge")
      await manager.attempt()
      expect(waitForChallengeSpy).toHaveBeenCalled()
    })

    it("should respond if challenge received", async () => {
      const respondSpy = vi.spyOn(manager, "respond")
      manager.state.challenge = "challenge123"
      manager.state.status = AuthStatus.Requested
      await manager.attempt()
      expect(respondSpy).toHaveBeenCalled()
    })

    it("should wait for resolution", async () => {
      const waitForResolutionSpy = vi.spyOn(manager, "waitForResolution")
      await manager.attempt()
      expect(waitForResolutionSpy).toHaveBeenCalled()
    })
  })

  describe("makeAuthEvent", () => {
    it("should create auth event with correct tags", () => {
      const url = "wss://test.relay"
      const challenge = "challenge123"

      makeAuthEvent(url, challenge)

      expect(makeEvent).toHaveBeenCalledWith(CLIENT_AUTH, {
        tags: [
          ["relay", url],
          ["challenge", challenge]
        ]
      })
    })
  })
})
