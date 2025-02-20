import {now} from "@welshman/lib"
import {getAddress} from "@welshman/util"
import {describe, it, vi, expect, beforeEach} from "vitest"
import {Repository} from "../src/Repository"
import type {TrustedEvent} from "../src/Events"
import {DELETE, MUTES} from "../src/Kinds"

describe("Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Realistic Nostr data
  const pubkey = "ee".repeat(32)
  const id = "ff".repeat(32)
  const sig = "00".repeat(64)
  const currentTime = now()

  const createEvent = (overrides = {}): TrustedEvent => ({
    id: id,
    pubkey: pubkey,
    created_at: currentTime,
    kind: 1,
    tags: [],
    content: "Hello Nostr!",
    sig: sig,
    ...overrides,
  })

  describe("basic operations", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("should publish and retrieve events", () => {
      const event = createEvent()
      expect(repo.publish(event)).toBe(true)
      expect(repo.getEvent(event.id)).toEqual(event)
    })

    it("should not publish invalid events", () => {
      const invalidEvent = {} as TrustedEvent
      const result = repo.publish(invalidEvent)
      expect(result).toBe(false)
    })

    it("should handle duplicate events", () => {
      const event = createEvent()
      expect(repo.publish(event)).toBe(true)
      expect(repo.publish(event)).toBe(false)
    })

    it("should check if events exist", () => {
      const event = createEvent()
      repo.publish(event)
      expect(repo.hasEvent(event)).toBe(true)
    })
  })

  describe("replaceable events", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("should handle replaceable events", () => {
      const event1 = createEvent({kind: MUTES, created_at: currentTime - 100})
      const event2 = createEvent({kind: MUTES, created_at: currentTime, id: "ee".repeat(32)})

      const address1 = getAddress(event1)
      const address2 = getAddress(event2)

      repo.publish(event1)
      repo.publish(event2)

      expect(repo.getEvent(event1.id)).toEqual(event1)
      expect(repo.getEvent(address1)).toEqual(event2)
      expect(repo.getEvent(event2.id)).toEqual(event2)
      expect(repo.getEvent(address2)).toEqual(event2)

      const event3 = createEvent({kind: MUTES, created_at: currentTime - 50, id: "dd".repeat(32)})

      repo.publish(event3)

      expect(repo.getEvent(event3.id)).toBeUndefined()
    })

    it("should not replace with older events", () => {
      const event1 = createEvent({kind: MUTES, created_at: currentTime})
      const event2 = createEvent({kind: MUTES, created_at: currentTime - 100})

      repo.publish(event1)
      repo.publish(event2)

      expect(repo.getEvent(event1.id)).toEqual(event1)
    })
  })

  describe("delete events", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("should handle delete events", () => {
      const event = createEvent()
      const deleteEvent = createEvent({
        id: "ee".repeat(32),
        kind: DELETE,
        tags: [["e", event.id]],
        created_at: currentTime + 100,
      })

      repo.publish(event)
      repo.publish(deleteEvent)

      expect(repo.isDeleted(event)).toBe(true)
    })

    it("should handle delete by address", () => {
      const event = createEvent({kind: MUTES})
      const deleteEvent = createEvent({
        id: "ee".repeat(32),
        kind: DELETE,
        tags: [["a", `10000:${event.pubkey}:`]],
        created_at: currentTime + 100,
      })

      repo.publish(event)
      repo.publish(deleteEvent)

      expect(repo.isDeletedByAddress(event)).toBe(true)
    })
  })

  describe("query operations", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("should throw on invalid queries", () => {
      expect(() => repo.query([{limit: 10}], {shouldSort: false})).toThrow()
    })

    it("should query by ids", () => {
      const event = createEvent()
      repo.publish(event)

      const results = repo.query([{ids: [event.id]}])
      expect(results).toContain(event)
    })

    it("should query by authors", () => {
      const event = createEvent()
      repo.publish(event)

      const results = repo.query([{authors: [event.pubkey]}])
      expect(results).toContain(event)
    })

    it("should query by kinds", () => {
      const event = createEvent({kind: 1})
      repo.publish(event)

      const results = repo.query([{kinds: [1]}])
      expect(results).toContain(event)
    })

    it("should query by tags", () => {
      const event = createEvent({tags: [["p", pubkey]]})
      repo.publish(event)

      const results = repo.query([{"#p": [pubkey]}])
      expect(results).toContain(event)
    })

    it("should query by time range", () => {
      const event = createEvent()
      repo.publish(event)

      const results = repo.query([
        {
          since: currentTime - 3600,
          until: currentTime + 3600,
        },
      ])
      expect(results).toContain(event)
    })

    it("should handle multiple filters", () => {
      const event = createEvent({kind: 1})
      repo.publish(event)

      const results = repo.query([{kinds: [1]}, {authors: [event.pubkey]}])
      expect(results).toHaveLength(1)
      expect(results).toContain(event)
    })

    it("should respect limit parameter", () => {
      const events = [
        createEvent({id: id + "1", created_at: currentTime}),
        createEvent({id: id + "2", created_at: currentTime - 100}),
      ]

      events.forEach(e => repo.publish(e))

      const results = repo.query([{limit: 1}])
      expect(results).toHaveLength(1)
      expect(results[0]).toEqual(events[0]) // Most recent event
    })

    it("should not return deleted events", () => {
      const event = createEvent()
      const deleteEvent = createEvent({
        id: "ee".repeat(32),
        kind: DELETE,
        tags: [["e", event.id]],
        created_at: currentTime + 100,
      })

      repo.publish(event)
      repo.publish(deleteEvent)

      const results = repo.query([{kinds: [1]}])
      expect(results).not.toContain(event)
    })
  })

  describe("dump and load", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("should dump all events", () => {
      const event = createEvent()
      repo.publish(event)

      const dumped = repo.dump()
      expect(dumped).toContain(event)
    })

    it("should load events", () => {
      const event = createEvent()
      repo.load([event])

      expect(repo.getEvent(event.id)).toEqual(event)
    })

    it("should handle chunked loading", () => {
      const events = Array.from({length: 1500}, (_, i) => createEvent({id: id.slice(0, -1) + i}))

      repo.load(events, 500)
      expect(repo.dump()).toHaveLength(1500)
    })

    it("should emit update events", () => {
      const event = createEvent()
      const updateHandler = vi.fn()

      repo.on("update", updateHandler)
      repo.load([event])

      expect(updateHandler).toHaveBeenCalledWith({
        added: [event],
        removed: new Set(),
      })
    })
  })

  describe("wrapped events", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("should handle wrapped events", () => {
      const wrapped = createEvent()
      const event = createEvent({
        wrap: wrapped,
      })

      repo.publish(event)
      expect(repo.eventsByWrap.get(wrapped.id)).toEqual(event)
    })
  })

  describe("event removal", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("should remove events", () => {
      const event = createEvent()
      repo.publish(event)
      repo.removeEvent(event.id)

      expect(repo.getEvent(event.id)).toBeUndefined()
    })

    it("should remove wrapped events", () => {
      const wrapped = createEvent()
      const event = createEvent({
        wrap: wrapped,
      })

      repo.publish(event)
      repo.removeEvent(event.id)

      expect(repo.eventsByWrap.get(wrapped.id)).toBeUndefined()
    })

    it("should emit update on removal", () => {
      const event = createEvent()
      const updateHandler = vi.fn()

      repo.on("update", updateHandler)
      repo.publish(event)
      repo.removeEvent(event.id)

      expect(updateHandler).toHaveBeenLastCalledWith({
        added: [],
        removed: [event.id],
      })
    })
  })
})
