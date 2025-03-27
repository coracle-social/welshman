import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { Socket } from "../src/socket"
import { Pool, makeSocket } from "../src/pool"
import { normalizeRelayUrl } from "@welshman/util"

// Mock dependencies
vi.mock("@welshman/lib", () => ({
  remove: vi.fn((item, array) => array.filter(x => x !== item)),
  on: vi.fn((target, event, callback) => {
    if (target.on) {
      target.on(event, callback)
    }
    return () => {
      if (target.off) {
        target.off(event, callback)
      }
    }
  }),
  call: vi.fn(fn => fn())
}))

vi.mock("@welshman/util", () => ({
  normalizeRelayUrl: vi.fn(url => url)
}))

vi.mock("../src/socket", async (importOriginal) => {
  const original = await importOriginal()

  return {
    ...original,
    Socket: vi.fn().mockImplementation((url) => ({
      url,
      cleanup: vi.fn(),
      _sendQueue: {
        start: vi.fn(),
        stop: vi.fn()
      },
      on: vi.fn(),
      off: vi.fn()
    })),
  }
})

describe("makeSocket", () => {
  let mockSocket: any

  beforeEach(() => {
    mockSocket = {
      url: "wss://test.relay",
      cleanup: vi.fn(),
      _sendQueue: {
        start: vi.fn(),
        stop: vi.fn()
      },
      on: vi.fn(),
      off: vi.fn()
    }
    vi.mocked(Socket).mockReturnValue(mockSocket)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("should create socket with url", () => {
    const socket = makeSocket("wss://test.relay", [])
    expect(Socket).toHaveBeenCalledWith("wss://test.relay")
  })

  it("should apply custom policies", () => {
    const customPolicy = vi.fn(() => () => {})
    const socket = makeSocket("wss://test.relay", [customPolicy])
    expect(customPolicy).toHaveBeenCalledWith(mockSocket)
  })
})

describe("Pool", () => {
  let pool: Pool
  let customMakeSocket: jest.Mock

  beforeEach(() => {
    customMakeSocket = vi.fn()
    pool = new Pool({ makeSocket: customMakeSocket })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("initialization", () => {
    it("should initialize with empty data map", () => {
      expect(pool._data.size).toBe(0)
    })

    it("should initialize with empty subscriptions", () => {
      expect(pool._subs).toEqual([])
    })
  })

  describe("has", () => {
    it("should return false for non-existent socket", () => {
      expect(pool.has("wss://test.relay")).toBe(false)
    })

    it("should return true for existing socket", () => {
      const mockSocket = { url: "wss://test.relay" }
      customMakeSocket.mockReturnValue(mockSocket)
      pool.get("wss://test.relay")
      expect(pool.has("wss://test.relay")).toBe(true)
    })
  })

  describe("makeSocket", () => {
    it("should use custom makeSocket if provided", () => {
      const mockSocket = { url: "wss://test.relay" }
      customMakeSocket.mockReturnValue(mockSocket)
      
      const result = pool.makeSocket("wss://test.relay")
      
      expect(customMakeSocket).toHaveBeenCalledWith("wss://test.relay")
      expect(result).toBe(mockSocket)
    })

    it("should use default makeSocket if none provided", () => {
      pool = new Pool({})
      const socket = pool.makeSocket("wss://test.relay")
      expect(Socket).toHaveBeenCalledWith("wss://test.relay")
    })
  })

  describe("get", () => {
    it("should normalize relay URL", () => {
      const mockSocket = { url: "wss://test.relay" }
      customMakeSocket.mockReturnValue(mockSocket)
      pool.get("wss://test.relay")
      expect(normalizeRelayUrl).toHaveBeenCalledWith("wss://test.relay")
    })

    it("should create new socket if none exists", () => {
      const mockSocket = { url: "wss://test.relay" }
      customMakeSocket.mockReturnValue(mockSocket)

      const socket = pool.get("wss://test.relay")

      expect(customMakeSocket).toHaveBeenCalledWith("wss://test.relay")
      expect(socket).toBe(mockSocket)
    })

    it("should return existing socket if it exists", () => {
      const mockSocket = { url: "wss://test.relay" }
      customMakeSocket.mockReturnValue(mockSocket)

      const firstSocket = pool.get("wss://test.relay")
      const secondSocket = pool.get("wss://test.relay")

      expect(customMakeSocket).toHaveBeenCalledTimes(1)
      expect(firstSocket).toBe(secondSocket)
    })

    it("should notify subscribers of new sockets", () => {
      const sub1 = vi.fn()
      const sub2 = vi.fn()
      const mockSocket = { url: "wss://test.relay" }
      customMakeSocket.mockReturnValue(mockSocket)

      pool.subscribe(sub1)
      pool.subscribe(sub2)
      pool.get("wss://test.relay")

      expect(sub1).toHaveBeenCalledWith(mockSocket)
      expect(sub2).toHaveBeenCalledWith(mockSocket)
    })

    it("should not notify subscribers for existing sockets", () => {
      const mockSocket = { url: "wss://test.relay" }
      customMakeSocket.mockReturnValue(mockSocket)
      pool.get("wss://test.relay")
      
      const sub = vi.fn()
      pool.subscribe(sub)
      pool.get("wss://test.relay")

      expect(sub).not.toHaveBeenCalled()
    })
  })

  describe("subscribe", () => {
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
      const mockSocket = { url: "wss://test.relay", cleanup: vi.fn() }
      customMakeSocket.mockReturnValue(mockSocket)
      
      pool.get("wss://test.relay")
      pool.remove("wss://test.relay")

      expect(mockSocket.cleanup).toHaveBeenCalled()
      expect(pool._data.has("wss://test.relay")).toBe(false)
    })

    it("should do nothing for non-existent socket", () => {
      pool.remove("wss://test.relay")
      expect(pool._data.has("wss://test.relay")).toBe(false)
    })
  })

  describe("clear", () => {
    it("should remove all sockets", () => {
      const urls = ["wss://test1.relay", "wss://test2.relay"]
      const mockSockets = urls.map(url => ({ url, cleanup: vi.fn() }))
      let socketIndex = 0
      customMakeSocket.mockImplementation(() => mockSockets[socketIndex++])

      urls.forEach(url => pool.get(url))
      pool.clear()

      expect(pool._data.size).toBe(0)
      mockSockets.forEach(socket => {
        expect(socket.cleanup).toHaveBeenCalled()
      })
    })

    it("should do nothing on empty pool", () => {
      expect(() => pool.clear()).not.toThrow()
    })
  })
})
