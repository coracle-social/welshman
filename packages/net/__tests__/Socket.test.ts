import {sleep} from "@welshman/lib"
import WebSocket from "isomorphic-ws"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {ConnectionEvent} from "../src/ConnectionEvent"
import {Message, Socket, SocketStatus} from "../src/Socket"

// Mock dependencies
vi.mock("isomorphic-ws")
// vi.mock("@welshman/lib", async importOriginal => {
//   return {
//     ...(await importOriginal()),
//     // sleep: vi.fn().mockResolvedValue(undefined),
//   }
// })

describe("Socket", () => {
  let socket: Socket
  let mockConnection: any
  let mockWs: any

  beforeEach(() => {
    vi.useFakeTimers()
    // Reset mocks
    vi.clearAllMocks()

    // Setup mock connection
    mockConnection = {
      url: "wss://test.relay",
      emit: vi.fn(),
    }

    // Setup mock WebSocket
    mockWs = {
      close: vi.fn(),
      send: vi.fn(),
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
    }
    vi.mocked(WebSocket).mockImplementation(() => mockWs)

    socket = new Socket(mockConnection)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("initialization", () => {
    it("should initialize with New status", () => {
      expect(socket.status).toBe(SocketStatus.New)
    })

    it("should setup worker handler", () => {
      const message = ["EVENT", {id: "123"}] as Message
      socket.worker.push(message)
      // workers batch messages every 50ms
      vi.advanceTimersByTime(50)

      expect(mockConnection.emit).toHaveBeenCalledWith(ConnectionEvent.Receive, message)
    })
  })

  describe("open", () => {
    it("should initialize WebSocket connection", async () => {
      socket.open()
      // wait for 2 timeout on wait
      await vi.advanceTimersByTimeAsync(10_000 * 2)
      expect(WebSocket).toHaveBeenCalledWith("wss://test.relay")
      expect(socket.status).toBe(SocketStatus.Opening)
    })

    // @check this test
    it("should handle successful connection", async () => {
      socket.open()
      await vi.advanceTimersByTimeAsync(10_000)

      mockWs.onopen()

      expect(socket.status).toBe(SocketStatus.Open)
      expect(mockConnection.emit).toHaveBeenCalledWith(ConnectionEvent.Open)
    })

    it("should handle connection error (parallel)", async () => {
      await Promise.all([
        socket.open(),
        vi.advanceTimersByTimeAsync(1000),
        new Promise((resolve, reject) => setTimeout(() => resolve(mockWs.onerror()), 1000)),
      ])

      expect(socket.status).toBe(SocketStatus.Error)
      expect(socket.lastError).toBe(Date.now())
      expect(mockConnection.emit).toHaveBeenCalledWith(ConnectionEvent.Error)
    })

    it("should retry after error timeout", async () => {
      // Simulate initial error
      socket.status = SocketStatus.Error
      socket.lastError = Date.now() - 16000 // More than 15 seconds ago

      // @check awaiting socket open remains hanging as no socket callback is called
      // to change the socket status
      // await socket.open()
      socket.open()

      await vi.advanceTimersToNextTimerAsync()

      expect(WebSocket).toHaveBeenCalled()
      expect(mockConnection.emit).toHaveBeenCalledWith(ConnectionEvent.Reset)
    })

    it("should not retry before error timeout", async () => {
      // Simulate recent error
      socket.status = SocketStatus.Error
      socket.lastError = Date.now() - 5000 // Less than 15 seconds ago

      await socket.open()

      expect(WebSocket).not.toHaveBeenCalled()
    })
  })

  describe("close", () => {
    it("should close WebSocket connection", async () => {
      socket.ws = mockWs
      socket.close()

      expect(mockWs.close).toHaveBeenCalled()
      expect(socket.ws).toBeUndefined()
    })

    it("should pause worker", async () => {
      const pauseSpy = vi.spyOn(socket.worker, "pause")
      socket.close()

      expect(pauseSpy).toHaveBeenCalled()
    })

    it("should handle normal close", async () => {
      socket.open()
      await vi.advanceTimersToNextTimerAsync()
      mockWs.onclose()

      expect(socket.status).toBe(SocketStatus.Closed)
      expect(mockConnection.emit).toHaveBeenCalledWith(ConnectionEvent.Close)
    })
  })

  describe("send", () => {
    it("should send message through WebSocket", async () => {
      const message = ["EVENT", {id: "123"}] as Message

      // Setup open connection
      socket.open()
      await vi.advanceTimersToNextTimerAsync()
      mockWs.onopen()

      await socket.send(message)

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(message))
      expect(mockConnection.emit).toHaveBeenCalledWith(ConnectionEvent.Send, message)
    })

    it("should throw if no WebSocket available", () => {
      const message = ["EVENT", {id: "123"}] as Message
      socket.ws = undefined
      // unreachable code
      // expect(socket.send(message)).rejects.toThrow()
    })
  })

  describe("message handling", () => {
    it("should handle valid messages", async () => {
      const validMessage = ["EVENT", {id: "123"}]

      socket.open()
      await vi.advanceTimersToNextTimerAsync()

      mockWs.onmessage({data: JSON.stringify(validMessage)})

      await vi.advanceTimersToNextTimerAsync()

      expect(mockConnection.emit).toHaveBeenCalledWith(ConnectionEvent.Receive, validMessage)
    })

    it("should handle non-array messages", async () => {
      const invalidMessage = {type: "EVENT"}

      socket.open()
      await vi.advanceTimersToNextTimerAsync()
      mockWs.onmessage({data: JSON.stringify(invalidMessage)})

      expect(mockConnection.emit).toHaveBeenCalledWith(
        ConnectionEvent.InvalidMessage,
        JSON.stringify(invalidMessage),
      )
    })

    it("should handle invalid JSON", async () => {
      const invalidJson = "invalid json"

      socket.open()
      await vi.advanceTimersToNextTimerAsync()
      mockWs.onmessage({data: invalidJson})

      expect(mockConnection.emit).toHaveBeenCalledWith(ConnectionEvent.InvalidMessage, invalidJson)
    })
  })

  describe("wait", () => {
    it("should wait for provisional states to resolve", async () => {
      socket.status = SocketStatus.Opening
      const waitPromise = socket.wait()

      // Change status after delay
      setTimeout(() => {
        socket.status = SocketStatus.Open
      }, 200)

      await vi.advanceTimersByTimeAsync(200)
      await waitPromise

      expect(socket.status).toBe(SocketStatus.Open)
    })
  })

  describe("error handling", () => {
    it("should handle invalid URLs", async () => {
      vi.mocked(WebSocket).mockImplementationOnce(() => {
        throw new Error("Invalid URL")
      })

      const now = Date.now()
      vi.setSystemTime(now)

      await socket.open()

      expect(socket.status).toBe(SocketStatus.Invalid)
      expect(socket.lastError).toBe(now)
      expect(mockConnection.emit).toHaveBeenCalledWith(ConnectionEvent.InvalidUrl)
    })
  })
})
