import {Pool} from "../src/Pool"
import {Connection} from "../src/Connection"
import {vi, describe, it, expect, beforeEach} from "vitest"

// Mock Connection class
vi.mock("../src/Connection", () => ({
  Connection: vi.fn().mockImplementation(url => ({
    url,
    cleanup: vi.fn(),
  })),
}))

describe("Pool", () => {
  let pool: Pool

  beforeEach(() => {
    vi.clearAllMocks()
    pool = new Pool()
  })

  describe("initialization", () => {
    it("should initialize with empty data map", () => {
      expect(pool.data.size).toBe(0)
    })
  })

  describe("has", () => {
    it("should return false for non-existent connection", () => {
      expect(pool.has("wss://test.relay")).toBe(false)
    })

    it("should return true for existing connection", () => {
      pool.get("wss://test.relay")
      expect(pool.has("wss://test.relay")).toBe(true)
    })
  })

  describe("get", () => {
    it("should create new connection if none exists", () => {
      const connection = pool.get("wss://test.relay")

      expect(Connection).toHaveBeenCalledWith("wss://test.relay")
      expect(pool.data.get("wss://test.relay")).toBe(connection)
    })

    it("should emit init event for new connections", () => {
      const initSpy = vi.fn()
      pool.on("init", initSpy)

      const connection = pool.get("wss://test.relay")

      expect(initSpy).toHaveBeenCalledWith(connection)
    })

    it("should return existing connection if it exists", () => {
      const firstConnection = pool.get("wss://test.relay")
      const secondConnection = pool.get("wss://test.relay")

      expect(Connection).toHaveBeenCalledTimes(1)
      expect(firstConnection).toBe(secondConnection)
    })

    it("should not emit init event for existing connections", () => {
      const initSpy = vi.fn()
      pool.get("wss://test.relay")

      pool.on("init", initSpy)
      pool.get("wss://test.relay")

      expect(initSpy).not.toHaveBeenCalled()
    })
  })

  describe("remove", () => {
    it("should remove existing connection", () => {
      const connection = pool.get("wss://test.relay")
      pool.remove("wss://test.relay")

      expect(pool.has("wss://test.relay")).toBe(false)
      expect(connection.cleanup).toHaveBeenCalled()
    })

    it("should do nothing for non-existent connection", () => {
      pool.remove("wss://test.relay")
      expect(pool.has("wss://test.relay")).toBe(false)
    })

    it("should cleanup connection before removal", () => {
      const connection = pool.get("wss://test.relay")
      pool.remove("wss://test.relay")

      const spy = vi.spyOn(pool.data, "delete")

      expect(connection.cleanup).toHaveBeenCalled()
    })
  })

  describe("clear", () => {
    it("should remove all connections", () => {
      const urls = ["wss://test1.relay", "wss://test2.relay", "wss://test3.relay"]

      // Create multiple connections
      urls.forEach(url => pool.get(url))
      expect(pool.data.size).toBe(3)

      pool.clear()
      expect(pool.data.size).toBe(0)
    })

    it("should cleanup all connections", () => {
      const urls = ["wss://test1.relay", "wss://test2.relay", "wss://test3.relay"]

      const connections = urls.map(url => pool.get(url))
      pool.clear()

      connections.forEach(connection => {
        expect(connection.cleanup).toHaveBeenCalled()
      })
    })

    it("should do nothing on empty pool", () => {
      expect(() => pool.clear()).not.toThrow()
    })
  })
})
