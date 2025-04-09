import {describe, expect, it, vi, beforeEach, afterEach} from "vitest"
import {Socket} from "../src/socket"
import {Pool} from "../src/pool"

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

describe("Pool", () => {
  let pool: Pool

  beforeEach(() => {
    pool = new Pool()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("has", () => {
    it("should return false for non-existent socket", () => {
      expect(pool.has("wss://test.relay")).toBe(false)
    })

    it("should return true for existing socket, normalizing the url", () => {
      pool.get("wss://test.relay/")
      expect(pool.has("wss://test.relay")).toBe(true)
    })
  })

  describe("get", () => {
    it("should create new socket if none exists, normalizing the relay url", () => {
      const socket = pool.get("wss://test.relay")

      expect(socket.url).toEqual("wss://test.relay/")
    })

    it("should return existing socket if it exists", () => {
      const firstSocket = pool.get("wss://test.relay")
      const secondSocket = pool.get("wss://test.relay")

      expect(firstSocket).toBe(secondSocket)
    })
  })

  describe("subscribe", () => {
    it("should notify subscribers of new sockets", () => {
      const sub1 = vi.fn()
      const sub2 = vi.fn()

      pool.subscribe(sub1)
      pool.subscribe(sub2)
      pool.get("wss://test.relay")

      expect(sub1).toHaveBeenCalledTimes(1)
      expect(sub2).toHaveBeenCalledTimes(1)
    })

    it("should not notify subscribers for existing sockets", () => {
      pool.get("wss://test.relay")

      const sub = vi.fn()
      pool.subscribe(sub)
      pool.get("wss://test.relay")

      expect(sub).not.toHaveBeenCalled()
    })

    it("should add subscription", () => {
      const sub = vi.fn()
      pool.subscribe(sub)
      expect(pool._subs).toContain(sub)
    })

    it("should return unsubscribe function", () => {
      const sub = vi.fn()
      const unsubscribe = pool.subscribe(sub)

      unsubscribe()

      expect(pool._subs).not.toContain(sub)
    })
  })

  describe("remove", () => {
    it("should remove and cleanup existing socket", () => {
      const mockSocket = {url: "wss://test.relay", cleanup: vi.fn()}

      pool._data.set(mockSocket.url, mockSocket as unknown as Socket)
      pool.remove(mockSocket.url)

      expect(mockSocket.cleanup).toHaveBeenCalled()
      expect(pool._data.has(mockSocket.url)).toBe(false)
    })

    it("should do nothing for non-existent socket", () => {
      pool.remove("wss://test.relay")
      expect(pool._data.has("wss://test.relay")).toBe(false)
    })
  })

  describe("clear", () => {
    it("should remove all sockets", () => {
      const urls = ["wss://test1.relay", "wss://test2.relay"]
      const mockSockets = urls.map(url => ({url, cleanup: vi.fn()}))

      for (const mockSocket of mockSockets) {
        pool._data.set(mockSocket.url, mockSocket as unknown as Socket)
      }

      pool.clear()

      expect(pool._data.size).toBe(0)
      mockSockets.forEach(socket => {
        expect(socket.cleanup).toHaveBeenCalled()
      })
    })
  })
})
