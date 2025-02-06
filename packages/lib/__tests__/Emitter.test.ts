import {describe, it, expect, beforeEach, vi} from "vitest"
import {Emitter} from "../src/Emitter"

describe("Emitter", () => {
  let emitter: Emitter

  beforeEach(() => {
    emitter = new Emitter()
  })

  it("should emit events to specific listeners", () => {
    const listener = vi.fn()
    emitter.on("test", listener)

    const args = ["arg1", 2, {key: "value"}]
    emitter.emit("test", ...args)

    expect(listener).toHaveBeenCalledWith(...args)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("should emit events to wildcard listeners", () => {
    const wildcardListener = vi.fn()
    emitter.on("*", wildcardListener)

    const args = ["arg1", 2, {key: "value"}]
    emitter.emit("test", ...args)

    expect(wildcardListener).toHaveBeenCalledWith("test", ...args)
    expect(wildcardListener).toHaveBeenCalledTimes(1)
  })

  it("should emit to both specific and wildcard listeners", () => {
    const specificListener = vi.fn()
    const wildcardListener = vi.fn()

    emitter.on("test", specificListener)
    emitter.on("*", wildcardListener)

    const args = ["arg1", 2, {key: "value"}]
    emitter.emit("test", ...args)

    expect(specificListener).toHaveBeenCalledWith(...args)
    expect(wildcardListener).toHaveBeenCalledWith("test", ...args)
  })

  it("should return true if both listeners exist", () => {
    emitter.on("test", () => {})
    emitter.on("*", () => {})

    const result = emitter.emit("test", "arg")
    expect(result).toBe(true)
  })

  it("should return false if no listeners exist", () => {
    const result = emitter.emit("test", "arg")
    expect(result).toBe(false)
  })

  it("should handle multiple listeners for same event", () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    emitter.on("test", listener1)
    emitter.on("test", listener2)

    emitter.emit("test", "arg")

    expect(listener1).toHaveBeenCalledWith("arg")
    expect(listener2).toHaveBeenCalledWith("arg")
  })

  it("should handle multiple wildcard listeners", () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    emitter.on("*", listener1)
    emitter.on("*", listener2)

    emitter.emit("test", "arg")

    expect(listener1).toHaveBeenCalledWith("test", "arg")
    expect(listener2).toHaveBeenCalledWith("test", "arg")
  })

  it("should handle listener removal", () => {
    const listener = vi.fn()
    emitter.on("test", listener)
    emitter.removeListener("test", listener)

    emitter.emit("test", "arg")

    expect(listener).not.toHaveBeenCalled()
  })

  it("should handle wildcard listener removal", () => {
    const listener = vi.fn()
    emitter.on("*", listener)
    emitter.removeListener("*", listener)

    emitter.emit("test", "arg")

    expect(listener).not.toHaveBeenCalled()
  })

  it("should handle once listeners", () => {
    const listener = vi.fn()
    emitter.once("test", listener)

    emitter.emit("test", "arg1")
    emitter.emit("test", "arg2")

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith("arg1")
  })

  it("should handle once wildcard listeners", () => {
    const listener = vi.fn()
    emitter.once("*", listener)

    emitter.emit("test1", "arg1")
    emitter.emit("test2", "arg2")

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith("test1", "arg1")
  })

  it("should handle nostr event data", () => {
    const listener = vi.fn()
    const wildcardListener = vi.fn()

    emitter.on("test", listener)
    emitter.on("*", wildcardListener)

    const complexData = {
      id: "ff".repeat(32), // Realistic event ID
      pubkey: "ee".repeat(32), // Realistic pubkey
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [["p", "ee".repeat(32)]],
      content: "Hello Nostr!",
    }

    emitter.emit("test", complexData)

    expect(listener).toHaveBeenCalledWith(complexData)
    expect(wildcardListener).toHaveBeenCalledWith("test", complexData)
  })

  it("should maintain correct event order", () => {
    const events: string[] = []

    emitter.on("test", () => events.push("specific"))
    emitter.on("*", () => events.push("wildcard"))

    emitter.emit("test")

    expect(events).toEqual(["specific", "wildcard"])
  })
})
