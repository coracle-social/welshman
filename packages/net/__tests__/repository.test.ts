import {describe, it, vi, expect, beforeEach} from "vitest"
import {now, choice, range} from "@welshman/lib"
import {getAddress, makeEvent, TrustedEvent, DELETE, MUTES} from "@welshman/util"
import {Repository} from "../src/repository"

const randomHex = () =>
  Array.from(range(0, 64))
    .map(() => choice(Array.from("0123456789abcdef")))
    .join("")

const createEvent = (kind: number, extra = {}) => ({
  ...makeEvent(kind),
  pubkey: randomHex(),
  id: randomHex(),
  sig: "fake",
  ...extra,
})

describe("Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("basic operations", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("should publish and retrieve events", () => {
      const event = createEvent(1)
      expect(repo.publish(event)).toBe(true)
      expect(repo.getEvent(event.id)).toEqual(event)
    })

    it("should not publish invalid events", () => {
      const invalidEvent = {} as TrustedEvent
      const result = repo.publish(invalidEvent)
      expect(result).toBe(false)
    })

    it("should handle duplicate events", () => {
      const event = createEvent(1)
      expect(repo.publish(event)).toBe(true)
      expect(repo.publish(event)).toBe(false)
    })

    it("should check if events exist", () => {
      const event = createEvent(1)
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
      const pubkey = randomHex()
      const event1 = createEvent(MUTES, {created_at: now() - 100, pubkey})
      const event2 = createEvent(MUTES, {created_at: now(), pubkey})

      const address1 = getAddress(event1)
      const address2 = getAddress(event2)

      repo.publish(event1)
      repo.publish(event2)

      expect(repo.getEvent(event1.id)).toEqual(event1)
      expect(repo.getEvent(address1)).toEqual(event2)
      expect(repo.getEvent(event2.id)).toEqual(event2)
      expect(repo.getEvent(address2)).toEqual(event2)

      const event3 = createEvent(MUTES, {created_at: now() - 50, pubkey})

      repo.publish(event3)

      expect(repo.getEvent(event3.id)).toBeUndefined()
    })

    it("should not replace with older events", () => {
      const event1 = createEvent(MUTES, {created_at: now()})
      const event2 = createEvent(MUTES, {created_at: now() - 100})

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
      const event = createEvent(1)
      const deleteEvent = createEvent(DELETE, {tags: [["e", event.id]], created_at: now() + 100})

      repo.publish(event)
      repo.publish(deleteEvent)

      expect(repo.isDeleted(event)).toBe(true)
    })

    it("should handle delete by address", () => {
      const event = createEvent(MUTES)
      const deleteEvent = createEvent(DELETE, {
        tags: [["a", `10000:${event.pubkey}:`]],
        created_at: now() + 100,
      })

      repo.publish(event)
      repo.publish(deleteEvent)

      expect(repo.isDeletedByAddress(event)).toBe(true)
    })
  })

  describe("expire events", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("should handle expiring events", () => {
      const event1 = createEvent(1, {tags: [["expiration", String(now() - 100)]]})
      const event2 = createEvent(1, {tags: [["expiration", String(now() + 100)]]})
      const event3 = createEvent(1)

      repo.publish(event1)
      repo.publish(event2)
      repo.publish(event3)

      expect(repo.isExpired(event1)).toBe(true)
      expect(repo.isExpired(event2)).toBe(false)
      expect(repo.isExpired(event3)).toBe(false)
    })
  })

  describe("query operations", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("should query by ids", () => {
      const event = createEvent(1)
      repo.publish(event)

      const results = repo.query([{ids: [event.id]}])
      expect(results).toContain(event)
    })

    it("should query by authors", () => {
      const event = createEvent(1)
      repo.publish(event)

      const results = repo.query([{authors: [event.pubkey]}])
      expect(results).toContain(event)
    })

    it("should query by kinds", () => {
      const event = createEvent(1)
      repo.publish(event)

      const results = repo.query([{kinds: [1]}])
      expect(results).toContain(event)
    })

    it("should query by tags", () => {
      const pubkey = randomHex()
      const event = createEvent(1, {tags: [["p", pubkey]]})

      repo.publish(event)

      const results = repo.query([{"#p": [pubkey]}])
      expect(results).toContain(event)
    })

    it("should query by time range", () => {
      const event = createEvent(1)
      repo.publish(event)

      const results = repo.query([
        {
          since: now() - 3600,
          until: now() + 3600,
        },
      ])
      expect(results).toContain(event)
    })

    it("should handle multiple filters", () => {
      const event = createEvent(1)
      repo.publish(event)

      const results = repo.query([{kinds: [1]}, {authors: [event.pubkey]}])
      expect(results).toHaveLength(1)
      expect(results).toContain(event)
    })

    it("should respect limit parameter", () => {
      const events = [
        createEvent(1, {created_at: now()}),
        createEvent(1, {created_at: now() - 100}),
      ]

      events.forEach(e => repo.publish(e))

      const results = repo.query([{limit: 1}])
      expect(results).toHaveLength(1)
      expect(results[0]).toEqual(events[0]) // Most recent event
    })

    it("should not return deleted events", () => {
      const event = createEvent(1)
      const deleteEvent = createEvent(DELETE, {tags: [["e", event.id]], created_at: now() + 1})

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
      const event = createEvent(1)
      repo.publish(event)

      const dumped = repo.dump()
      expect(dumped).toContain(event)
    })

    it("should load events", () => {
      const event = createEvent(1)
      repo.load([event])

      expect(repo.getEvent(event.id)).toEqual(event)
    })

    it("should handle chunked loading", () => {
      const events = Array.from({length: 1500}, (_, i) => createEvent(1))

      repo.load(events, 500)
      expect(repo.dump()).toHaveLength(1500)
    })

    it("should emit update events", () => {
      const event = createEvent(1)
      const updateHandler = vi.fn()

      repo.on("update", updateHandler)
      repo.load([event])

      expect(updateHandler).toHaveBeenCalledWith({
        added: [event],
        removed: new Set(),
      })
    })
  })

  describe("event removal", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("should remove events", () => {
      const event = createEvent(1)
      repo.publish(event)
      repo.removeEvent(event.id)

      expect(repo.getEvent(event.id)).toBeUndefined()
    })

    it("should emit update on removal", () => {
      const event = createEvent(1)
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
