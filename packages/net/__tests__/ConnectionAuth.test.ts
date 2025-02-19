import {ConnectionAuth, AuthStatus, AuthMode} from "../src/ConnectionAuth"
import {Connection} from "../src/Connection"
import {ConnectionEvent} from "../src/ConnectionEvent"
import {ctx, sleep} from "@welshman/lib"
import {vi, describe, it, expect, beforeEach, afterEach} from "vitest"
import {SocketStatus} from "../src/Socket"

describe("ConnectionAuth", () => {
  let connection: Connection
  let auth: ConnectionAuth
  let mockSignEvent: any

  beforeEach(() => {
    vi.useFakeTimers()
    connection = new Connection("wss://test.relay/")
    // Mock socket operations
    connection.socket.open = vi.fn().mockResolvedValue(undefined)
    connection.socket.status = SocketStatus.Open
    connection.send = vi.fn().mockResolvedValue(undefined)

    auth = connection.auth
    mockSignEvent = vi.fn()
    ctx.net = {...ctx.net, signEvent: mockSignEvent, authMode: AuthMode.Explicit}
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("initialization", () => {
    it("should initialize with None status", () => {
      expect(auth.status).toBe(AuthStatus.None)
      expect(auth.challenge).toBeUndefined()
      expect(auth.request).toBeUndefined()
      expect(auth.message).toBeUndefined()
    })
  })

  describe("message handling", () => {
    it("should handle AUTH message and set challenge", () => {
      connection.emit(ConnectionEvent.Receive, ["AUTH", "challenge123"])
      expect(auth.challenge).toBe("challenge123")
      expect(auth.status).toBe(AuthStatus.Requested)
    })

    it("should ignore AUTH message if challenge matches current challenge", () => {
      auth.challenge = "challenge123"
      auth.status = AuthStatus.PendingResponse

      connection.emit(ConnectionEvent.Receive, ["AUTH", "challenge123"])
      expect(auth.status).toBe(AuthStatus.PendingResponse)
    })

    it("should handle successful OK message", () => {
      auth.challenge = "challenge123"
      auth.request = "request123"
      auth.status = AuthStatus.PendingResponse

      connection.emit(ConnectionEvent.Receive, ["OK", "request123", true, "success"])
      expect(auth.status).toBe(AuthStatus.Ok)
      expect(auth.message).toBe("success")
    })

    it("should handle failed OK message", () => {
      auth.challenge = "challenge123"
      auth.request = "request123"
      auth.status = AuthStatus.PendingResponse

      connection.emit(ConnectionEvent.Receive, ["OK", "request123", false, "forbidden"])
      expect(auth.status).toBe(AuthStatus.Forbidden)
      expect(auth.message).toBe("forbidden")
    })

    it("should ignore OK message for different request", () => {
      auth.challenge = "challenge123"
      auth.request = "request123"
      auth.status = AuthStatus.PendingResponse

      connection.emit(ConnectionEvent.Receive, ["OK", "different123", true, "success"])
      expect(auth.status).toBe(AuthStatus.PendingResponse)
      expect(auth.message).toBeUndefined()
    })
  })

  describe("connection close handling", () => {
    it("should reset state on connection close", () => {
      auth.challenge = "challenge123"
      auth.request = "request123"
      auth.message = "message"
      auth.status = AuthStatus.Ok

      connection.emit(ConnectionEvent.Close)

      expect(auth.challenge).toBeUndefined()
      expect(auth.request).toBeUndefined()
      expect(auth.message).toBeUndefined()
      expect(auth.status).toBe(AuthStatus.None)
    })
  })

  describe("respond()", () => {
    it("should throw if no challenge exists", async () => {
      await expect(auth.respond()).rejects.toThrow("Attempted to authenticate with no challenge")
    })

    it("should throw if status is not Requested", async () => {
      auth.challenge = "challenge123"
      auth.status = AuthStatus.Ok

      await expect(auth.respond()).rejects.toThrow(
        "Attempted to authenticate when auth is already ok",
      )
    })

    it("should handle successful signature", async () => {
      auth.challenge = "challenge123"
      auth.status = AuthStatus.Requested
      const signedEvent = {id: "event123" /* other event fields */}
      mockSignEvent.mockResolvedValue(signedEvent)

      await auth.respond()

      expect(auth.request).toBe("event123")
      expect(auth.status).toBe(AuthStatus.PendingResponse)
      expect(connection.send).toHaveBeenCalledWith(["AUTH", signedEvent])
    })

    it("should handle denied signature", async () => {
      auth.challenge = "challenge123"
      auth.status = AuthStatus.Requested
      mockSignEvent.mockResolvedValue(undefined)

      await auth.respond()

      expect(auth.status).toBe(AuthStatus.DeniedSignature)
      expect(connection.send).not.toHaveBeenCalled()
    })
  })

  describe("automatic authentication", () => {
    it("should auto-respond in implicit mode", () => {
      ctx.net.authMode = AuthMode.Implicit
      const respondSpy = vi.spyOn(auth, "respond")

      connection.emit(ConnectionEvent.Receive, ["AUTH", "challenge123"])
      expect(respondSpy).toHaveBeenCalled()
    })

    it("should not auto-respond in explicit mode", () => {
      ctx.net.authMode = AuthMode.Explicit
      const respondSpy = vi.spyOn(auth, "respond")

      connection.emit(ConnectionEvent.Receive, ["AUTH", "challenge123"])
      expect(respondSpy).not.toHaveBeenCalled()
    })
  })

  describe("waitFor methods", () => {
    it("should wait for challenge", async () => {
      const waitPromise = auth.waitForChallenge()

      setTimeout(() => {
        connection.emit(ConnectionEvent.Receive, ["AUTH", "challenge123"])
      }, 100)

      vi.advanceTimersByTime(100)
      await waitPromise
      expect(auth.challenge).toBe("challenge123")
    })

    it("should timeout waiting for challenge", async () => {
      const waitPromise = auth.waitForChallenge(50)

      vi.advanceTimersByTime(100)
      await waitPromise
      expect(auth.challenge).toBeUndefined()
    })

    it("should wait for resolution", async () => {
      auth.challenge = "challenge123"
      auth.request = "request123"
      auth.status = AuthStatus.PendingResponse

      const waitPromise = auth.waitForResolution()

      setTimeout(() => {
        connection.emit(ConnectionEvent.Receive, ["OK", "request123", true, "success"])
      }, 100)

      vi.advanceTimersByTime(100)
      await waitPromise
      expect(auth.status).toBe(AuthStatus.Ok)
    })

    it("should timeout waiting for resolution", async () => {
      auth.status = AuthStatus.PendingResponse

      const waitPromise = auth.waitForResolution(50)

      vi.advanceTimersByTime(100)
      await waitPromise
      expect(auth.status).toBe(AuthStatus.PendingResponse)
    })
  })

  describe("attempt()", () => {
    it("should complete full authentication flow", async () => {
      const signedEvent = {id: "event123" /* other event fields */}
      mockSignEvent.mockResolvedValue(signedEvent)

      const attemptPromise = auth.attempt()

      // Simulate socket opening and challenge received

      setTimeout(() => {
        connection.emit(ConnectionEvent.Receive, ["AUTH", "challenge123"])
      }, 100)

      await vi.advanceTimersByTimeAsync(100)

      // Simulate successful authentication
      setTimeout(() => {
        connection.emit(ConnectionEvent.Receive, ["OK", "event123", true, "success"])
      }, 200)

      await vi.advanceTimersByTimeAsync(200)

      await attemptPromise

      expect(auth.status).toBe(AuthStatus.Ok)
    })

    it("should handle authentication failure", async () => {
      mockSignEvent.mockResolvedValue(undefined)

      const attemptPromise = auth.attempt()

      setTimeout(() => {
        connection.emit(ConnectionEvent.Receive, ["AUTH", "challenge123"])
      }, 100)

      await vi.advanceTimersByTimeAsync(200)

      await attemptPromise

      expect(auth.status).toBe(AuthStatus.DeniedSignature)
    })

    it("should timeout if no challenge received", async () => {
      const attemptPromise = auth.attempt(100)

      // 2 loops (2 * 100ms) in the waitForChallenge before timeout
      // 1 loop in waitForResolution as it reach the condition immediately
      await vi.advanceTimersByTimeAsync(100)

      await attemptPromise

      expect(auth.status).toBe(AuthStatus.None)
    })
  })
})
