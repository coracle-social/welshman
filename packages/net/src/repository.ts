import {DAY, Emitter, flatten, pluck, sortBy, inc, uniq, omit, now, range} from "@welshman/lib"
import {
  DELETE,
  EPOCH,
  matchFilter,
  isReplaceable,
  getAddress,
  Filter,
  TrustedEvent,
} from "@welshman/util"

export const LOCAL_RELAY_URL = "local://welshman.relay/"

const getDay = (ts: number) => Math.floor(ts / DAY)

export let repositorySingleton: Repository

export type RepositoryUpdate = {
  added: TrustedEvent[]
  removed: Set<string>
}

export const mergeRepositoryUpdates = (updates: RepositoryUpdate[]): RepositoryUpdate => {
  const added: TrustedEvent[] = []
  const removed = new Set<string>()

  for (const update of updates) {
    for (const event of update.added) {
      added.push(event)
      removed.delete(event.id)
    }

    for (const id of update.removed) {
      removed.add(id)
    }
  }

  return {added, removed}
}

export class Repository extends Emitter {
  eventsById = new Map<string, TrustedEvent>()
  eventsByAddress = new Map<string, TrustedEvent>()
  eventsByTag = new Map<string, TrustedEvent[]>()
  eventsByDay = new Map<number, TrustedEvent[]>()
  eventsByAuthor = new Map<string, TrustedEvent[]>()
  eventsByKind = new Map<number, TrustedEvent[]>()
  deletes = new Map<string, number>()
  expired = new Map<string, number>()

  static get() {
    if (!repositorySingleton) {
      repositorySingleton = new Repository()
    }

    return repositorySingleton
  }

  constructor() {
    super()

    this.setMaxListeners(1000)
  }

  // Dump/load/clear

  dump = () => {
    return Array.from(this.eventsById.values())
  }

  load = (events: TrustedEvent[]) => {
    const stale = new Set(this.eventsById.keys())

    this.eventsById.clear()
    this.eventsByAddress.clear()
    this.eventsByTag.clear()
    this.eventsByDay.clear()
    this.eventsByAuthor.clear()
    this.eventsByKind.clear()
    this.deletes.clear()
    this.expired.clear()

    const added = []

    for (const event of events) {
      if (this.publish(event, {shouldNotify: false})) {
        // Don't send duplicate events to subscribers
        if (!stale.has(event.id)) {
          added.push(event)
        }
      }
    }

    const removed = new Set<string>()

    // Anything we had before clearing the repository has been removed
    for (const id of stale) {
      if (!this.eventsById.has(id)) {
        removed.add(id)
      }
    }

    // Anything removed via delete or replace has been removed
    for (const id of this.deletes.keys()) {
      removed.add(id)
    }

    // Anything expired has been removed
    for (const id of this.expired.keys()) {
      removed.add(id)
    }

    this.emit("update", {added, removed})
  }

  // API

  getEvent = (idOrAddress: string) => {
    return idOrAddress.includes(":")
      ? this.eventsByAddress.get(idOrAddress)
      : this.eventsById.get(idOrAddress)
  }

  hasEvent = (event: TrustedEvent) => {
    const duplicate = this.eventsById.get(event.id) || this.eventsByAddress.get(getAddress(event))

    return duplicate && duplicate.created_at >= event.created_at
  }

  removeEvent = (idOrAddress: string) => {
    const event = this.getEvent(idOrAddress)

    if (event) {
      this.eventsById.delete(event.id)
      this.eventsByAddress.delete(getAddress(event))

      for (const [k, v] of event.tags) {
        if (k.length === 1) {
          this._updateIndex(this.eventsByTag, `${k}:${v}`, undefined, event)
        }
      }

      this._updateIndex(this.eventsByDay, getDay(event.created_at), undefined, event)
      this._updateIndex(this.eventsByAuthor, event.pubkey, undefined, event)
      this._updateIndex(this.eventsByKind, event.kind, undefined, event)

      this.emit("update", {added: [], removed: [event.id]})
    }
  }

  query = (
    filters: Filter[],
    {includeDeleted = false, includeExpired = false, shouldSort = true} = {},
  ) => {
    const result: TrustedEvent[][] = []
    for (const originalFilter of filters) {
      if (originalFilter.limit !== undefined && !shouldSort) {
        throw new Error("Unable to skip sorting if limit is defined")
      }

      // Attempt to fulfill the query using one of our indexes. Fall back to all events.
      const applied = this._applyAnyFilter(originalFilter)
      const filter = applied?.filter || originalFilter
      const events = applied ? this._getEvents(applied!.ids) : this.dump()
      const sorted = this._sortEvents(shouldSort && Boolean(filter.limit), events)

      const chunk: TrustedEvent[] = []
      for (const event of sorted) {
        if (filter.limit && chunk.length >= filter.limit) {
          break
        }

        if (!includeDeleted && this.isDeleted(event)) {
          continue
        }

        if (!includeExpired && this.isExpired(event)) {
          continue
        }

        if (matchFilter(filter, event)) {
          chunk.push(event)
        }
      }

      result.push(chunk)
    }

    // Only re-sort if we had multiple filters, or if our single filter wasn't sorted
    const shouldSortAll = shouldSort && (filters.length > 1 || !filters[0]?.limit)

    return this._sortEvents(shouldSortAll, uniq(flatten(result)))
  }

  publish = (event: TrustedEvent, {shouldNotify = true} = {}): boolean => {
    if (!event?.id) {
      console.warn("Attempted to publish invalid event to repository", event)

      return false
    }

    // If we've already seen this event we're done
    if (this.eventsById.get(event.id)) {
      return false
    }

    const removed = new Set<string>()
    const address = getAddress(event)
    const duplicate = this.eventsByAddress.get(address)

    if (duplicate) {
      // If our event is younger than the duplicate, we're done
      if (event.created_at < duplicate.created_at) {
        return false
      }

      // If our event is newer than what it's replacing, delete the old version
      this.deletes.set(duplicate.id, event.created_at)

      // Notify listeners that it's been removed
      removed.add(duplicate.id)
    }

    // Add our new event by id
    this.eventsById.set(event.id, event)

    // Add our new event by address
    if (isReplaceable(event)) {
      this.eventsByAddress.set(address, event)
    }

    // Update our timestamp and author indexes
    this._updateIndex(this.eventsByDay, getDay(event.created_at), event, duplicate)
    this._updateIndex(this.eventsByAuthor, event.pubkey, event, duplicate)
    this._updateIndex(this.eventsByKind, event.kind, event, duplicate)

    // Update our tag indexes
    for (const tag of event.tags) {
      if (tag[0]?.length === 1) {
        this._updateIndex(this.eventsByTag, tag.slice(0, 2).join(":"), event, duplicate)

        // If this is a delete event, the tag value is an id or address. Track when it was
        // deleted so that replaceables can be restored.
        if (event.kind === DELETE && ["a", "e"].includes(tag[0]) && tag[1]) {
          this.deletes.set(tag[1], Math.max(event.created_at, this.deletes.get(tag[1]) || 0))

          const deletedEvent = this.getEvent(tag[1])

          if (deletedEvent && this.isDeleted(deletedEvent)) {
            removed.add(deletedEvent.id)
          }
        }
      }

      // Keep track of whether this event is expired
      if (tag[0] === "expiration") {
        const expiration = parseInt(tag[1] || "")

        if (!isNaN(expiration)) {
          this.expired.set(event.id, expiration)
        }
      }
    }

    if (shouldNotify) {
      this.emit("update", {added: [event], removed})
    }

    return true
  }

  isDeletedByAddress = (event: TrustedEvent) =>
    (this.deletes.get(getAddress(event)) || 0) > event.created_at

  isDeletedById = (event: TrustedEvent) => (this.deletes.get(event.id) || 0) > event.created_at

  isDeleted = (event: TrustedEvent) => this.isDeletedByAddress(event) || this.isDeletedById(event)

  isExpired = (event: TrustedEvent) => {
    const ts = this.expired.get(event.id)

    return Boolean(ts && ts < now())
  }

  // Utilities

  _sortEvents = (shouldSort: boolean, events: TrustedEvent[]) =>
    shouldSort ? sortBy(e => -e.created_at, events) : events

  _updateIndex = <K>(
    m: Map<K, TrustedEvent[]>,
    k: K,
    add?: TrustedEvent,
    remove?: TrustedEvent,
  ) => {
    let a = m.get(k) || []

    if (remove) {
      a = a.filter((x: TrustedEvent) => x !== remove)
    }

    if (add) {
      a.push(add)
    }

    m.set(k, a)
  }

  _getEvents = (ids: Iterable<string>) => {
    const events: TrustedEvent[] = []

    for (const id of ids) {
      const event = this.eventsById.get(id)

      if (event) {
        events.push(event)
      }
    }

    return events
  }

  _applyIdsFilter = (filter: Filter) => {
    if (!filter.ids) return undefined

    return {
      filter: omit(["ids"], filter),
      ids: new Set(filter.ids),
    }
  }

  _applyAuthorsFilter = (filter: Filter) => {
    if (!filter.authors) return undefined

    const events = filter.authors.flatMap(pubkey => this.eventsByAuthor.get(pubkey) || [])

    return {
      filter: omit(["authors"], filter),
      ids: new Set(pluck<string>("id", events)),
    }
  }

  _applyTagsFilter = (filter: Filter) => {
    for (const [k, values] of Object.entries(filter)) {
      if (!k.startsWith("#") || k.length !== 2) {
        continue
      }

      const ids = new Set<string>()

      for (const v of values as string[]) {
        for (const event of this.eventsByTag.get(`${k[1]}:${v}`) || []) {
          ids.add(event.id)
        }
      }

      return {filter: omit([k], filter), ids}
    }

    return undefined
  }

  _applyKindsFilter = (filter: Filter) => {
    if (!filter.kinds) return undefined

    const events = filter.kinds.flatMap(kind => this.eventsByKind.get(kind) || [])

    return {
      filter: omit(["kinds"], filter),
      ids: new Set(pluck<string>("id", events)),
    }
  }

  _applyDaysFilter = (filter: Filter) => {
    if (!filter.since && !filter.until) return undefined

    const sinceDay = getDay(filter.since || EPOCH)
    const untilDay = getDay(filter.until || now())
    const days = Array.from(range(sinceDay, inc(untilDay)))
    const events = days.flatMap((day: number) => this.eventsByDay.get(day) || [])
    const ids = new Set(pluck<string>("id", events))

    return {filter, ids}
  }

  _applyAnyFilter = (filter: Filter) => {
    const matchers = [
      this._applyIdsFilter,
      this._applyAuthorsFilter,
      this._applyTagsFilter,
      this._applyKindsFilter,
      this._applyDaysFilter,
    ]

    for (const matcher of matchers) {
      const result = matcher(filter)

      if (result) {
        return result
      }
    }

    return undefined
  }
}
