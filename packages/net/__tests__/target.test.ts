import {LOCAL_RELAY_URL} from "@welshman/util"
import {beforeEach, describe, expect, it, vi} from "vitest"
import {ConnectionEvent, Echo, Local, Multi, Relay, Relays} from "../src/index"

describe("Target implementations", () => {
  describe("Echo", () => {
    it("should emit received messages", () => {
      const echo = new Echo()
      const spy = vi.fn()
      echo.on("event", spy)

      echo.send("event", "data")
      expect(spy).toHaveBeenCalledWith("data")
    })

    it("should cleanup properly", () => {
      const echo = new Echo()
      const spy = vi.fn()
      echo.on("event", spy)
      echo.cleanup()

      echo.send("event", "data")
      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe("Local", () => {
    let mockRelay: any

    beforeEach(() => {
      mockRelay = {
        on: vi.fn(),
        off: vi.fn(),
        send: vi.fn(),
      }
    })

    it("should route messages through relay", async () => {
      const local = new Local(mockRelay)
      await local.send("event", "data")
      expect(mockRelay.send).toHaveBeenCalledWith("event", "data")
    })

    it("should emit received messages with LOCAL_RELAY_URL", () => {
      const local = new Local(mockRelay)
      const spy = vi.fn()
      local.on("event", spy)

      mockRelay.on.mock.calls[0][1]("event", "data")
      expect(spy).toHaveBeenCalledWith(LOCAL_RELAY_URL, "data")
    })

    it("should remove relay listener on cleanup", () => {
      const local = new Local(mockRelay)
      const onMessage = mockRelay.on.mock.calls[0][1]

      local.cleanup()
      expect(mockRelay.off).toHaveBeenCalledWith("*", onMessage)
    })
  })

  describe("Multi", () => {
    let target1: any
    let target2: any

    beforeEach(() => {
      target1 = {send: vi.fn(), on: vi.fn(), cleanup: vi.fn(), connections: []}
      target2 = {send: vi.fn(), on: vi.fn(), cleanup: vi.fn(), connections: []}
    })

    it("should forward messages to all targets", async () => {
      const multi = new Multi([target1, target2])
      await multi.send("event", "data")

      expect(target1.send).toHaveBeenCalledWith("event", "data")
      expect(target2.send).toHaveBeenCalledWith("event", "data")
    })

    it("should propagate events from targets", () => {
      const multi = new Multi([target1, target2])
      const spy = vi.fn()
      multi.on("event", spy)

      target1.on.mock.calls[0][1]("event", "data")
      expect(spy).toHaveBeenCalledWith("data")
    })

    it("should cleanup all targets", () => {
      const multi = new Multi([target1, target2])
      multi.cleanup()

      expect(target1.cleanup).toHaveBeenCalled()
      expect(target2.cleanup).toHaveBeenCalled()
    })
  })

  describe("Relay", () => {
    let mockConnection: any

    beforeEach(() => {
      mockConnection = {
        on: vi.fn(),
        off: vi.fn(),
        send: vi.fn(),
        url: "test-url",
      }
    })

    it("should forward messages to connection", async () => {
      const relay = new Relay(mockConnection)
      await relay.send("event", "data")
      expect(mockConnection.send).toHaveBeenCalledWith(["event", "data"])
    })

    it("should emit received messages with connection url", () => {
      const relay = new Relay(mockConnection)
      const spy = vi.fn()
      relay.on("event", spy)

      mockConnection.on.mock.calls[0][1](mockConnection, ["event", "data"])
      expect(spy).toHaveBeenCalledWith("test-url", "data")
    })

    it("should remove connection listener on cleanup", () => {
      const relay = new Relay(mockConnection)
      const onMessage = mockConnection.on.mock.calls[0][1]

      relay.cleanup()
      expect(mockConnection.off).toHaveBeenCalledWith(ConnectionEvent.Receive, onMessage)
    })

    it("should stop propagating events after cleanup", () => {
      const relay = new Relay(mockConnection)
      const spy = vi.fn()
      relay.on("event", spy)

      relay.cleanup()

      mockConnection.on.mock.calls[0][1](mockConnection, ["event", "data"])
      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe("Relays", () => {
    let connections: any[]

    beforeEach(() => {
      connections = [
        {on: vi.fn(), off: vi.fn(), send: vi.fn(), url: "url1"},
        {on: vi.fn(), off: vi.fn(), send: vi.fn(), url: "url2"},
      ]
    })

    it("should forward messages to all connections", async () => {
      const relays = new Relays(connections)
      await relays.send("event", "data")

      connections.forEach(conn => {
        expect(conn.send).toHaveBeenCalledWith(["event", "data"])
      })
    })

    it("should emit received messages with connection url", () => {
      const relays = new Relays(connections)
      const spy = vi.fn()
      relays.on("event", spy)

      connections[0].on.mock.calls[0][1](connections[0], ["event", "data"])
      expect(spy).toHaveBeenCalledWith("url1", "data")
    })

    it("should remove all connection listeners on cleanup", () => {
      const relays = new Relays(connections)
      const onMessage = connections[0].on.mock.calls[0][1] // Same handler for all connections

      relays.cleanup()

      connections.forEach(conn => {
        expect(conn.off).toHaveBeenCalledWith("receive:message", onMessage)
      })
    })

    it("should stop propagating events after cleanup", () => {
      const relays = new Relays(connections)
      const spy = vi.fn()
      relays.on("event", spy)

      relays.cleanup()
      connections[0].on.mock.calls[0][1](connections[0], ["event", "data"])
      expect(spy).not.toHaveBeenCalled()
    })
  })
})
