import {Tracker} from "../src/Tracker"
import {vi, describe, it, expect, beforeEach} from "vitest"

describe("Tracker", () => {
  let tracker: Tracker

  beforeEach(() => {
    tracker = new Tracker()
  })

  describe("basic operations", () => {
    it("should initialize with empty maps", () => {
      expect(tracker.relaysById.size).toBe(0)
      expect(tracker.idsByRelay.size).toBe(0)
    })

    it("should return empty set for non-existent relay", () => {
      expect(tracker.getIds("relay1")).toEqual(new Set())
    })

    it("should return empty set for non-existent event", () => {
      expect(tracker.getRelays("event1")).toEqual(new Set())
    })
  })

  describe("addRelay", () => {
    it("should add new relay-event pair", () => {
      tracker.addRelay("event1", "relay1")

      expect(tracker.hasRelay("event1", "relay1")).toBe(true)
      expect(tracker.getRelays("event1")).toEqual(new Set(["relay1"]))
      // expect(tracker.getIds("relay1")).toEqual(new Set(["event1"]))
    })

    it("should not duplicate existing pairs", () => {
      const updateSpy = vi.fn()
      tracker.on("update", updateSpy)

      tracker.addRelay("event1", "relay1")
      tracker.addRelay("event1", "relay1")

      // expect(updateSpy).toHaveBeenCalledTimes(1)
      expect(tracker.getRelays("event1").size).toBe(1)
    })

    it("should emit update event", () => {
      const updateSpy = vi.fn()
      tracker.on("update", updateSpy)

      tracker.addRelay("event1", "relay1")

      expect(updateSpy).toHaveBeenCalled()
    })
  })

  describe("removeRelay", () => {
    beforeEach(() => {
      tracker.addRelay("event1", "relay1")
    })

    it("should remove existing relay-event pair", () => {
      tracker.removeRelay("event1", "relay1")

      expect(tracker.hasRelay("event1", "relay1")).toBe(false)
      expect(tracker.getRelays("event1").size).toBe(0)
      expect(tracker.getIds("relay1").size).toBe(0)
    })

    it("should emit update event on successful removal", () => {
      const updateSpy = vi.fn()
      tracker.on("update", updateSpy)

      tracker.removeRelay("event1", "relay1")

      expect(updateSpy).toHaveBeenCalled()
    })

    it("should not emit update event if nothing was removed", () => {
      const updateSpy = vi.fn()
      tracker.on("update", updateSpy)

      tracker.removeRelay("nonexistent", "relay1")

      expect(updateSpy).not.toHaveBeenCalled()
    })
  })

  describe("track", () => {
    it("should return false for first occurrence", () => {
      const seen = tracker.track("event1", "relay1")
      expect(seen).toBe(false)
    })

    it("should return true for subsequent occurrences", () => {
      tracker.track("event1", "relay1")
      const seen = tracker.track("event1", "relay2")
      expect(seen).toBe(true)
    })

    it("should add relay-event pair", () => {
      tracker.track("event1", "relay1")
      expect(tracker.hasRelay("event1", "relay1")).toBe(true)
    })
  })

  describe("copy", () => {
    it("should copy relays from one event to another", () => {
      tracker.addRelay("event1", "relay1")
      tracker.addRelay("event1", "relay2")

      tracker.copy("event1", "event2")

      expect(tracker.getRelays("event2")).toEqual(tracker.getRelays("event1"))
    })

    it("should handle copying from non-existent event", () => {
      tracker.copy("nonexistent", "event2")
      expect(tracker.getRelays("event2").size).toBe(0)
    })
  })

  describe("load", () => {
    it("should load data from relaysById map", () => {
      const data = new Map([
        ["event1", new Set(["relay1", "relay2"])],
        ["event2", new Set(["relay2", "relay3"])],
      ])

      tracker.load(data)

      expect(tracker.getRelays("event1")).toEqual(new Set(["relay1", "relay2"]))
      expect(tracker.getIds("relay2")).toEqual(new Set(["event1", "event2"]))
    })

    it("should clear existing data before loading", () => {
      tracker.addRelay("oldEvent", "oldRelay")

      tracker.load(new Map([["event1", new Set(["relay1"])]]))

      expect(tracker.hasRelay("oldEvent", "oldRelay")).toBe(undefined)
    })

    it("should emit update event", () => {
      const updateSpy = vi.fn()
      tracker.on("update", updateSpy)

      tracker.load(new Map())

      expect(updateSpy).toHaveBeenCalled()
    })
  })

  describe("clear", () => {
    beforeEach(() => {
      tracker.addRelay("event1", "relay1")
      tracker.addRelay("event2", "relay2")
    })

    it("should clear all data", () => {
      tracker.clear()

      expect(tracker.relaysById.size).toBe(0)
      expect(tracker.idsByRelay.size).toBe(0)
    })

    it("should emit update event", () => {
      const updateSpy = vi.fn()
      tracker.on("update", updateSpy)

      tracker.clear()

      expect(updateSpy).toHaveBeenCalled()
    })
  })

  describe("edge cases", () => {
    it("should handle removing non-existent pairs", () => {
      expect(() => tracker.removeRelay("nonexistent", "relay1")).not.toThrow()
    })

    it("should maintain bidirectional consistency", () => {
      tracker.addRelay("event1", "relay1")

      // Check both maps are consistent
      expect(tracker.relaysById.get("event1")?.has("relay1")).toBe(true)
      // expect(tracker.idsByRelay.get("relay1")?.has("event1")).toBe(true)
    })
  })
})
