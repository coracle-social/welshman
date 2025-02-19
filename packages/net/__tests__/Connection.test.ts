import {Connection, ConnectionStatus} from "../src/Connection"
import {ConnectionEvent} from "../src/ConnectionEvent"
import {vi, describe, it, expect, beforeEach, afterEach} from "vitest"

describe("Connection", () => {
  let connection: Connection

  beforeEach(() => {
    connection = new Connection("wss://test.relay/")
  })

  afterEach(() => {
    connection.cleanup()
  })

  it("should initialize with correct state", () => {
    expect(connection.status).toBe(ConnectionStatus.Open)
    expect(connection.url).toBe("wss://test.relay/")
  })

  it("should emit events with connection instance", () => {
    const spy = vi.fn()
    connection.on(ConnectionEvent.Open, spy)
    connection.emit(ConnectionEvent.Open)
    expect(spy).toHaveBeenCalledWith(connection)
  })

  it("should throw when sending message on closed connection", async () => {
    connection.close()
    await expect(connection.send(["EVENT", {}])).rejects.toThrow()
  })

  it("should cleanup properly", () => {
    const spy = vi.fn()
    connection.on("test", spy)
    connection.cleanup()
    connection.emit("test" as any)
    expect(spy).not.toHaveBeenCalled()
  })
})
