import {describe, it, vi, expect, beforeEach} from "vitest"
import {now, choice, pluck, range} from "@welshman/lib"
import {getAddress, makeEvent, sortEventsDesc, TrustedEvent, DELETE, MUTES} from "@welshman/util"
import {Repository, mergeRepositoryUpdates} from "../src/repository"

const randomHex = () =>
  Array.from(range(0, 64))
    .map(() => choice(Array.from("0123456789abcdef")))
    .join("")

const DAY = 86400

const createEvent = (kind: number, extra = {}) => ({
  ...makeEvent(kind),
  pubkey: randomHex(),
  id: randomHex(),
  sig: "fake",
  ...extra,
})

// `perDay` events on each of the last `days` days, alternating kind 1 and kind 7
const loadDays = (repo: Repository, days: number, perDay: number) => {
  const today = Math.floor(now() / DAY)
  const events: TrustedEvent[] = []

  for (let day = today; day > today - days; day--) {
    for (let i = 0; i < perDay; i++) {
      events.push(createEvent(i % 2 === 0 ? 1 : 7, {created_at: day * DAY + i}))
    }
  }

  repo.load(events)

  return events
}

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

    it("should not reindex a superseded version that comes back changed", () => {
      const pubkey = randomHex()
      const superseded = createEvent(MUTES, {pubkey, created_at: now() - 100})
      const current = createEvent(MUTES, {pubkey, created_at: now()})

      repo.publish(superseded)
      repo.publish(current)

      // A relay hands the superseded version back with its signature filled in.
      repo.publish({...superseded, sig: "real"})

      expect(repo.query([{kinds: [MUTES]}], {includeDeleted: true})).toEqual([current])
      expect(repo.getEvent(superseded.id)).toEqual({...superseded, sig: "real"})
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

    it("should take a signature for an event it holds unsigned, without removing anything", () => {
      const signed = createEvent(1)
      const unsigned = {...signed, sig: undefined} as unknown as TrustedEvent
      const updateHandler = vi.fn()

      expect(repo.publish(unsigned)).toBe(true)

      repo.on("update", updateHandler)

      expect(repo.publish(signed)).toBe(true)
      expect(repo.getEvent(signed.id)).toEqual(signed)
      expect(repo.query([{ids: [signed.id]}])).toEqual([signed])
      expect(updateHandler).toHaveBeenLastCalledWith({
        added: [signed],
        removed: new Set(),
      })
    })

    it("should ignore a second copy of an unsigned event it already holds", () => {
      const rumor = {...createEvent(1), sig: undefined} as unknown as TrustedEvent

      expect(repo.publish(rumor)).toBe(true)
      expect(repo.publish({...rumor, tags: [...rumor.tags]})).toBe(false)
    })

    it("should check if events exist", () => {
      const event = createEvent(1)
      repo.publish(event)
      expect(repo.hasEvent(event)).toBe(true)
    })

    it("should return false for events it doesn't hold", () => {
      expect(repo.hasEvent(createEvent(1))).toBe(false)
    })
  })

  describe("replaceable events", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("indexes a restored version once, so a page of it is full", () => {
      const pubkey = randomHex()
      const older = createEvent(MUTES, {created_at: now() - 3 * DAY, pubkey})
      const newer = createEvent(MUTES, {created_at: now(), pubkey})
      const other = createEvent(MUTES, {created_at: now() - 5 * DAY})

      repo.publish(other)
      repo.publish(older)
      repo.publish(newer)
      repo.removeEvent(newer.id)

      const page = repo.query([{kinds: [MUTES], limit: 2, until: now()}])

      expect(pluck("id", page)).toEqual([older.id, other.id])
    })

    it("restores a replaced version that received its signature after it was replaced", () => {
      const pubkey = randomHex()
      const older = createEvent(MUTES, {created_at: now() - 100, pubkey})
      const newer = createEvent(MUTES, {created_at: now(), pubkey})
      const {sig, ...unsigned} = older

      repo.publish(unsigned as TrustedEvent)
      repo.publish(newer)
      repo.publish({...unsigned, sig})
      repo.removeEvent(newer.id)

      expect(repo.getEvent(getAddress(older))?.sig).toBe(sig)
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

    it("should restore a superseded event when the event that replaced it is removed", () => {
      const pubkey = randomHex()
      const event1 = createEvent(MUTES, {created_at: now() - 100, pubkey})
      const event2 = createEvent(MUTES, {created_at: now(), pubkey})
      const address = getAddress(event1)

      repo.publish(event1)
      repo.publish(event2)
      repo.removeEvent(event2.id)

      expect(repo.getEvent(address)).toEqual(event1)
      expect(repo.isDeleted(event1)).toBe(false)
      expect(repo.query([{kinds: [MUTES], authors: [pubkey]}])).toEqual([event1])
    })

    it("should not restore a stale event when it is removed after being superseded again", () => {
      const pubkey = randomHex()
      const event1 = createEvent(MUTES, {created_at: now() - 200, pubkey})
      const event2 = createEvent(MUTES, {created_at: now() - 100, pubkey})
      const event3 = createEvent(MUTES, {created_at: now(), pubkey})
      const address = getAddress(event1)

      repo.publish(event1)
      repo.publish(event2)
      repo.publish(event3)

      // event2 is stale (superseded by event3); removing it must not disturb event3
      repo.removeEvent(event2.id)

      expect(repo.getEvent(address)).toEqual(event3)
      expect(repo.getEvent(event2.id)).toBeUndefined()
    })
  })

  describe("delete events", () => {
    let repo: Repository

    beforeEach(() => {
      repo = new Repository()
    })

    it("should handle delete events", () => {
      const pubkey = randomHex()
      const event = createEvent(1, {pubkey})
      const deleteEvent = createEvent(DELETE, {
        pubkey,
        tags: [["e", event.id]],
        created_at: now() + 100,
      })

      repo.publish(event)
      repo.publish(deleteEvent)

      expect(repo.isDeleted(event)).toBe(true)
    })

    it("should handle delete by address", () => {
      const pubkey = randomHex()
      const event = createEvent(MUTES, {pubkey})
      const deleteEvent = createEvent(DELETE, {
        pubkey,
        tags: [["a", `10000:${event.pubkey}:`]],
        created_at: now() + 100,
      })

      repo.publish(event)
      repo.publish(deleteEvent)

      expect(repo.isDeletedByAddress(event)).toBe(true)
    })

    it("deletes an event taken back in the same second it was published", () => {
      // Timestamps are whole seconds, and reacting then un-reacting lands inside one of them. An
      // id names a single immutable event, so there is no newer version for a timestamp comparison
      // to protect — the delete has to apply on the author alone.
      const pubkey = randomHex()
      const created_at = now()
      const event = createEvent(7, {pubkey, created_at})
      const deleteEvent = createEvent(DELETE, {pubkey, tags: [["e", event.id]], created_at})

      repo.publish(event)
      repo.publish(deleteEvent)

      expect(repo.isDeleted(event)).toBe(true)
    })

    it("should not delete events with mismatched pubkeys", () => {
      const event = createEvent(1)
      const deleteEvent = createEvent(DELETE, {tags: [["e", event.id]], created_at: now() + 1})

      repo.publish(event)
      repo.publish(deleteEvent)

      expect(repo.isDeleted(event)).toBe(false)
    })

    it("should restore an event when its deletion is removed", () => {
      const pubkey = randomHex()
      const event = createEvent(1, {pubkey})
      const deleteEvent = createEvent(DELETE, {
        pubkey,
        tags: [
          ["e", event.id],
          ["e", event.id],
        ],
        created_at: now() + 1,
      })
      const updateHandler = vi.fn()

      repo.publish(event)
      repo.publish(deleteEvent)
      repo.on("update", updateHandler)
      repo.removeEvent(deleteEvent.id)

      expect(repo.query([{ids: [event.id]}])).toEqual([event])
      expect(updateHandler).toHaveBeenLastCalledWith({
        added: [event],
        removed: new Set([deleteEvent.id]),
      })
    })

    it("should restore a replaceable event when its address deletion is removed", () => {
      const pubkey = randomHex()
      const event = createEvent(MUTES, {pubkey})
      const deleteEvent = createEvent(DELETE, {
        pubkey,
        tags: [["a", getAddress(event)]],
        created_at: now() + 1,
      })
      const updateHandler = vi.fn()

      repo.publish(event)
      repo.publish(deleteEvent)
      repo.on("update", updateHandler)
      repo.removeEvent(deleteEvent.id)

      expect(repo.query([{ids: [event.id]}])).toEqual([event])
      expect(updateHandler).toHaveBeenLastCalledWith({
        added: [event],
        removed: new Set([deleteEvent.id]),
      })
    })

    it("should keep a concurrent deletion effective when another is removed", () => {
      const pubkey = randomHex()
      const event = createEvent(1, {pubkey})
      const created_at = now() + 1
      const first = createEvent(DELETE, {pubkey, tags: [["e", event.id]], created_at})
      const second = createEvent(DELETE, {pubkey, tags: [["e", event.id]], created_at})

      repo.publish(event)
      repo.publish(first)
      repo.publish(second)
      repo.removeEvent(first.id)

      expect(repo.query([{ids: [event.id]}])).toEqual([])

      repo.removeEvent(second.id)

      expect(repo.query([{ids: [event.id]}])).toEqual([event])
    })

    it("should not announce a target a removed deletion never hid", () => {
      // A delete by another author never applied, so removing it uncovers nothing
      const event = createEvent(1)
      const deleteEvent = createEvent(DELETE, {tags: [["e", event.id]], created_at: now() + 1})
      const updateHandler = vi.fn()

      repo.publish(event)
      repo.publish(deleteEvent)
      repo.on("update", updateHandler)
      repo.removeEvent(deleteEvent.id)

      expect(updateHandler).toHaveBeenLastCalledWith({
        added: [],
        removed: new Set([deleteEvent.id]),
      })
    })

    it("should not announce an occupant a stale address deletion never hid", () => {
      // The address was republished after the delete, so the current occupant outlived it
      const pubkey = randomHex()
      const created_at = now()
      const stale = createEvent(MUTES, {pubkey, created_at: created_at - 10})
      const deleteEvent = createEvent(DELETE, {
        pubkey,
        tags: [["a", getAddress(stale)]],
        created_at: created_at - 5,
      })
      const current = createEvent(MUTES, {pubkey, created_at})
      const updateHandler = vi.fn()

      repo.publish(stale)
      repo.publish(deleteEvent)
      repo.publish(current)
      repo.on("update", updateHandler)
      repo.removeEvent(deleteEvent.id)

      expect(repo.isDeleted(current)).toBe(false)
      expect(updateHandler).toHaveBeenLastCalledWith({
        added: [],
        removed: new Set([deleteEvent.id]),
      })
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

    it("should drop expiration bookkeeping when the event is removed", () => {
      const event = createEvent(1, {tags: [["expiration", String(now() + 100)]]})

      repo.publish(event)
      repo.removeEvent(event.id)

      expect(repo.expired.has(event.id)).toBe(false)
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

    it("should read only the day buckets a windowed page needs", () => {
      loadDays(repo, 30, 6)

      const spy = vi.spyOn(repo.eventsByDay, "get")
      const results = repo.query([{kinds: [1], since: now() - 30 * DAY, until: now(), limit: 6}])

      expect(results).toHaveLength(6)
      expect(spy.mock.calls.length).toBe(2)
    })

    it("should return the same windowed page a full scan would have", () => {
      const events = loadDays(repo, 30, 6)
      const since = now() - 30 * DAY
      const expected = sortEventsDesc(
        events.filter(e => e.kind === 1 && e.created_at >= since && e.created_at <= now()),
      ).slice(0, 10)

      const results = repo.query([{kinds: [1], since, until: now(), limit: 10}])

      expect(pluck<string>("id", results)).toEqual(pluck<string>("id", expected))
    })

    it("should not let a deleted event shorten a windowed page", () => {
      const events = loadDays(repo, 30, 6)
      const today = Math.floor(now() / DAY)
      const newest = events.filter(e => e.kind === 1 && Math.floor(e.created_at / DAY) === today)

      for (const event of newest) {
        repo.publish(
          createEvent(DELETE, {
            pubkey: event.pubkey,
            tags: [["e", event.id]],
            created_at: now(),
          }),
        )
      }

      const results = repo.query([{kinds: [1], since: now() - 30 * DAY, until: now(), limit: 6}])

      expect(results).toHaveLength(6)
      expect(results.filter(e => newest.includes(e))).toEqual([])
    })

    it("should exclude an event in the since bucket that falls before since", () => {
      const sinceDay = Math.floor(now() / DAY) - 1
      const early = createEvent(1, {created_at: sinceDay * DAY})
      const late = createEvent(1, {created_at: sinceDay * DAY + 7200})

      repo.load([early, late])

      const results = repo.query([
        {kinds: [1], since: sinceDay * DAY + 3600, until: now(), limit: 10},
      ])

      expect(results).toContain(late)
      expect(results).not.toContain(early)
    })

    it("should return an event dated ahead of now for a window with no ceiling", () => {
      const future = createEvent(1, {created_at: now() + 3 * DAY})

      repo.publish(future)

      const results = repo.query([{kinds: [1], since: now() - DAY, limit: 10}])

      expect(results).toContain(future)
    })

    it("should not return deleted events", () => {
      const pubkey = randomHex()
      const event = createEvent(1, {pubkey})
      const deleteEvent = createEvent(DELETE, {
        pubkey,
        tags: [["e", event.id]],
        created_at: now() + 1,
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

    it("should load many events", () => {
      const events = Array.from({length: 1500}, (_, i) => createEvent(1))

      repo.load(events)
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

    it("should merge with existing events", () => {
      const existing = createEvent(1)
      const loaded = createEvent(1)

      repo.publish(existing)
      repo.load([loaded])

      expect(repo.getEvent(existing.id)).toEqual(existing)
      expect(repo.getEvent(loaded.id)).toEqual(loaded)
    })

    it("should not re-add events already present", () => {
      const event = createEvent(1)
      const updateHandler = vi.fn()

      repo.publish(event)
      repo.on("update", updateHandler)
      repo.load([event])

      expect(updateHandler).toHaveBeenCalledWith({
        added: [],
        removed: new Set(),
      })
    })

    it("should not report pending expirations or earlier deletes as removed", () => {
      const target = createEvent(1)
      const deletion = createEvent(DELETE, {pubkey: target.pubkey, tags: [["e", target.id]]})
      const pending = createEvent(1, {tags: [["expiration", String(now() + 100)]]})
      const updateHandler = vi.fn()

      repo.load([target, deletion])
      repo.on("update", updateHandler)
      repo.load([pending])

      expect(updateHandler).toHaveBeenCalledWith({added: [pending], removed: new Set()})
    })

    it("should report batch events that are already hidden as removed", () => {
      const expired = createEvent(1, {tags: [["expiration", String(now() - 100)]]})
      const deleted = createEvent(1)
      const deletion = createEvent(DELETE, {pubkey: deleted.pubkey, tags: [["e", deleted.id]]})
      const updateHandler = vi.fn()

      repo.on("update", updateHandler)
      repo.load([expired, deleted, deletion])

      expect(updateHandler).toHaveBeenCalledWith({
        added: [deletion],
        removed: new Set([expired.id, deleted.id]),
      })
    })

    it("should report existing events a delete in the batch hides as removed", () => {
      const existing = createEvent(1)
      const deletion = createEvent(DELETE, {pubkey: existing.pubkey, tags: [["e", existing.id]]})
      const updateHandler = vi.fn()

      repo.publish(existing)
      repo.on("update", updateHandler)
      repo.load([deletion])

      expect(updateHandler).toHaveBeenCalledWith({
        added: [deletion],
        removed: new Set([existing.id]),
      })
    })

    it("should report the same removals from publish as from load", () => {
      const older = createEvent(MUTES, {created_at: now() - 100})
      const newer = createEvent(MUTES, {created_at: now(), pubkey: older.pubkey})
      const deletion = createEvent(DELETE, {pubkey: older.pubkey, tags: [["e", newer.id]]})
      const updateHandler = vi.fn()

      repo.publish(older)
      repo.publish(deletion)
      repo.on("update", updateHandler)
      repo.publish(newer)

      expect(updateHandler).toHaveBeenCalledWith({
        added: [],
        removed: new Set([older.id, newer.id]),
      })
    })

    it("should replace an older version already present", () => {
      const older = createEvent(MUTES, {created_at: now() - 100})
      const newer = createEvent(MUTES, {created_at: now(), pubkey: older.pubkey})

      repo.publish(older)
      repo.load([newer])

      expect(repo.getEvent(getAddress(newer))).toEqual(newer)
      expect(repo.query([{kinds: [MUTES]}])).toEqual([newer])
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
        removed: new Set([event.id]),
      })
    })

    it("should emit the restored event as added when removal uncovers a supersession", () => {
      const pubkey = randomHex()
      const event1 = createEvent(MUTES, {created_at: now() - 100, pubkey})
      const event2 = createEvent(MUTES, {created_at: now(), pubkey})
      const updateHandler = vi.fn()

      repo.publish(event1)
      repo.publish(event2)
      repo.on("update", updateHandler)
      repo.removeEvent(event2.id)

      expect(updateHandler).toHaveBeenLastCalledWith({
        added: [event1],
        removed: new Set([event2.id]),
      })
    })

    it("should not clobber a newer event's address index when removing a stale id", () => {
      const pubkey = randomHex()
      const event1 = createEvent(MUTES, {created_at: now() - 200, pubkey})
      const event2 = createEvent(MUTES, {created_at: now() - 100, pubkey})
      const event3 = createEvent(MUTES, {created_at: now(), pubkey})
      const address = getAddress(event1)

      repo.publish(event1)
      repo.publish(event2)
      repo.publish(event3)
      repo.removeEvent(event1.id)

      expect(repo.getEvent(address)).toEqual(event3)
    })

    it("should not announce a version still shadowed by a newer one", () => {
      const pubkey = randomHex()
      const created_at = now()
      const event1 = createEvent(MUTES, {pubkey, created_at: created_at - 200})
      const event2 = createEvent(MUTES, {pubkey, created_at: created_at - 100})
      const event3 = createEvent(MUTES, {pubkey, created_at})
      const updateHandler = vi.fn()

      repo.publish(event1)
      repo.publish(event2)
      repo.publish(event3)
      repo.on("update", updateHandler)
      repo.removeEvent(event2.id)

      expect(repo.getEvent(getAddress(event1))).toEqual(event3)
      expect(updateHandler).toHaveBeenLastCalledWith({
        added: [],
        removed: new Set([event2.id]),
      })
    })

    it("should keep an explicit deletion when removing a replacement", () => {
      const pubkey = randomHex()
      const created_at = now()
      const event = createEvent(MUTES, {pubkey, created_at: created_at - 1})
      const deleteEvent = createEvent(DELETE, {pubkey, tags: [["e", event.id]], created_at})
      const replacement = createEvent(MUTES, {pubkey, created_at})
      const updateHandler = vi.fn()

      repo.publish(event)
      repo.publish(deleteEvent)
      repo.publish(replacement)
      repo.on("update", updateHandler)
      repo.removeEvent(replacement.id)

      expect(repo.getEvent(getAddress(event))).toEqual(event)
      expect(repo.isDeleted(event)).toBe(true)
      expect(repo.query([{ids: [event.id]}])).toEqual([])
      expect(updateHandler).toHaveBeenLastCalledWith({
        added: [],
        removed: new Set([replacement.id]),
      })
    })

    it("should not resurrect a version that was itself removed", () => {
      const pubkey = randomHex()
      const created_at = now()
      const event1 = createEvent(MUTES, {pubkey, created_at: created_at - 100})
      const event2 = createEvent(MUTES, {pubkey, created_at})

      repo.publish(event1)
      repo.publish(event2)
      repo.removeEvent(event1.id)
      repo.removeEvent(event2.id)

      expect(repo.getEvent(getAddress(event1))).toBeUndefined()
      expect(repo.query([{kinds: [MUTES]}])).toEqual([])
    })
  })

  describe("mergeRepositoryUpdates", () => {
    it("should net out a remove followed by a re-add", () => {
      const event = createEvent(1)

      const {added, removed} = mergeRepositoryUpdates([
        {added: [], removed: new Set([event.id])},
        {added: [event], removed: new Set()},
      ])

      expect(added).toEqual([event])
      expect(removed).toEqual(new Set())
    })

    it("should net out an add followed by a remove", () => {
      const event = createEvent(1)

      const {added, removed} = mergeRepositoryUpdates([
        {added: [event], removed: new Set()},
        {added: [], removed: new Set([event.id])},
      ])

      expect(added).toEqual([])
      expect(removed).toEqual(new Set([event.id]))
    })

    it("should dedupe repeated adds of the same event", () => {
      const event = createEvent(1)

      const {added, removed} = mergeRepositoryUpdates([
        {added: [event], removed: new Set()},
        {added: [event], removed: new Set()},
      ])

      expect(added).toEqual([event])
      expect(removed).toEqual(new Set())
    })

    it("should keep unrelated adds and removes", () => {
      const event1 = createEvent(1)
      const event2 = createEvent(1)

      const {added, removed} = mergeRepositoryUpdates([
        {added: [event1], removed: new Set()},
        {added: [], removed: new Set([event2.id])},
      ])

      expect(added).toEqual([event1])
      expect(removed).toEqual(new Set([event2.id]))
    })
  })
})
