import { sleep } from "@welshman/lib"
import WebSocket from "isomorphic-ws"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Socket, SocketStatus, SocketEventType } from "../src/socket"
import { ClientMessage, RelayMessage } from "../src/message"

vi.mock("isomorphic-ws")

describe("Socket", () => {
  let socket: Socket
  let mockWs: any

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    mockWs = {
      close: vi.fn(),
      send: vi.fn(),
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
    }

    vi.mocked(WebSocket).mockImplementation(() => mockWs)

    socket = new Socket("wss://test.relay")
  })

  afterEach(() => {
    socket.cleanup()
    vi.useRealTimers()
  })

  it("should initialize with correct url", () => {
    expect(socket.url).toBe("wss://test.relay")
  })

  describe("open", () => {
    it("should create websocket and emit opening status", () => {
      const statusSpy = vi.fn()
      socket.on(SocketEventType.Status, statusSpy)

      socket.open()

      expect(WebSocket).toHaveBeenCalledWith("wss://test.relay")
      expect(statusSpy).toHaveBeenCalledWith(SocketStatus.Opening, "wss://test.relay")
    })

    it("should emit open status when connection opens", () => {
      const statusSpy = vi.fn()
      socket.on(SocketEventType.Status, statusSpy)

      socket.open()
      mockWs.onopen()

      expect(statusSpy).toHaveBeenCalledWith(SocketStatus.Open, "wss://test.relay")
    })

    it("should throw error if socket already exists", () => {
      socket.open()
      expect(() => socket.open()).toThrow("Attempted to open a websocket that has not been closed")
    })

    it("should emit invalid status on invalid URL", () => {
      const statusSpy = vi.fn()
      socket.on(SocketEventType.Status, statusSpy)

      vi.mocked(WebSocket).mockImplementationOnce(() => {
        throw new Error()
      })

      socket.open()

      expect(statusSpy).toHaveBeenCalledWith(SocketStatus.Invalid, "wss://test.relay")
    })
  })

  describe("close", () => {
    it("should close websocket and emit closed status", () => {
      const statusSpy = vi.fn()
      socket.on(SocketEventType.Status, statusSpy)

      socket.open()
      socket.close()
      mockWs.onclose()

      expect(mockWs.close).toHaveBeenCalled()
      expect(statusSpy).toHaveBeenCalledWith(SocketStatus.Closed, "wss://test.relay")
    })
  })

  describe("send", () => {
    it("should queue messages and emit enqueue event", () => {
      const enqueueSpy = vi.fn()
      socket.on(SocketEventType.Enqueue, enqueueSpy)

      const message: ClientMessage = ["EVENT", { id: "123", kind: 1, content: "", tags: [], pubkey: "", sig: "" }]
      socket.send(message)

      expect(enqueueSpy).toHaveBeenCalledWith(message, "wss://test.relay")
    })

    it("should send queued messages when socket is open", async () => {
      const sendSpy = vi.fn()
      socket.on(SocketEventType.Send, sendSpy)

      socket.open()
      mockWs.onopen()

      const message: ClientMessage = ["EVENT", { id: "123", kind: 1, content: "", tags: [], pubkey: "", sig: "" }]
      socket.send(message)

      // Allow task queue to process
      await vi.runAllTimers()

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(message))
      expect(sendSpy).toHaveBeenCalledWith(message, "wss://test.relay")
    })
  })

  describe("receive", () => {
    it("should handle valid relay messages", async () => {
      const receiveSpy = vi.fn()
      socket.on(SocketEventType.Receive, receiveSpy)

      socket.open()
      const message: RelayMessage = ["EVENT", "123", { id: "123", kind: 1, content: "", tags: [], pubkey: "", sig: "" }]
      mockWs.onmessage({ data: JSON.stringify(message) })

      // Allow task queue to process
      await vi.runAllTimers()

      expect(receiveSpy).toHaveBeenCalledWith(message, "wss://test.relay")
    })

    it("should emit error on invalid JSON", () => {
      const errorSpy = vi.fn()
      socket.on(SocketEventType.Error, errorSpy)

      socket.open()
      mockWs.onmessage({ data: "invalid json" })

      expect(errorSpy).toHaveBeenCalledWith("Invalid message received", "wss://test.relay")
    })

    it("should emit error on non-array message", () => {
      const errorSpy = vi.fn()
      socket.on(SocketEventType.Error, errorSpy)

      socket.open()
      mockWs.onmessage({ data: JSON.stringify({ not: "an array" }) })

      expect(errorSpy).toHaveBeenCalledWith("Invalid message received", "wss://test.relay")
    })
  })

  describe("cleanup", () => {
    it("should close socket and clear queues", () => {
      socket.open()
      socket.cleanup()

      expect(mockWs.close).toHaveBeenCalled()
      expect(socket.listenerCount(SocketEventType.Send)).toBe(0)
    })
  })

  describe("error handling", () => {
    it("should emit error status on websocket error", () => {
      const statusSpy = vi.fn()
      socket.on(SocketEventType.Status, statusSpy)

      socket.open()
      mockWs.onerror()

      expect(statusSpy).toHaveBeenCalledWith(SocketStatus.Error, "wss://test.relay")
    })
  })

  describe("attemptToOpen", () => {
    it("should open socket if not already open", () => {
      const openSpy = vi.spyOn(socket, "open")

      socket.attemptToOpen()
      expect(openSpy).toHaveBeenCalled()
    })

    it("should not open socket if already open", () => {
      const openSpy = vi.spyOn(socket, "open")

      socket.open()
      socket.attemptToOpen()

      expect(openSpy).toHaveBeenCalledTimes(1)
    })
  })
})
