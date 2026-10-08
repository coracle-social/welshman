import {
  DAY,
  Emitter,
  equals,
  flatten,
  pick,
  pushToMapKey,
  pluck,
  inc,
  uniq,
  omit,
  now,
  range,
  mapPop,
  spec,
  some,
} from "@welshman/lib"
import {
  DELETE,
  EPOCH,
  matchFilter,
  isReplaceable,
  getAddress,
  sortEventsDesc,
  Filter,
  TrustedEvent,
} from "@welshman/util"

export const LOCAL_RELAY_URL = "local://welshman.relay/"

const getDay = (ts: number) => Math.floor(ts / DAY)

export type QueryOptions = {
  includeDeleted: boolean
  includeExpired: boolean
  shouldSort: boolean
  /** A constraint the filters can't express, applied before any limit counts the event. */
  where?: (event: TrustedEvent) => boolean
}

export type RepositoryUpdate = {
  added: TrustedEvent[]
  removed: Set<string>
}

export const mergeRepositoryUpdates = (updates: RepositoryUpdate[]): RepositoryUpdate => {
  const addedById = new Map<string, TrustedEvent>()
  const removed = new Set<string>()

  for (const update of updates) {
    for (const event of update.added) {
      addedById.set(event.id, event)
      removed.delete(event.id)
    }

    for (const id of update.removed) {
      removed.add(id)
      addedById.delete(id)
    }
  }

  return {added: Array.from(addedById.values()), removed}
}

export class Repository extends Emitter {
  eventsById = new Map<string, TrustedEvent>()
  eventsByAddress = new Map<string, TrustedEvent>()
  eventsByTag = new Map<string, TrustedEvent[]>()
  eventsByDay = new Map<number, TrustedEvent[]>()
  eventsByAuthor = new Map<string, TrustedEvent[]>()
  eventsByKind = new Map<number, TrustedEvent[]>()
  deletes = new Map<string, Pick<TrustedEvent, "id" | "created_at" | "pubkey">[]>()
  deletedBy = new Map<string, string[]>()
  expired = new Map<string, number>()
  replaced = new Map<string, TrustedEvent>()

  constructor() {
    super()

    this.setMaxListeners(1000)
  }

  // Dump/load/clear

  dump = () => {
    return Array.from(this.eventsById.values())
  }

  clear = () => {
    this.eventsById.clear()
    this.eventsByAddress.clear()
    this.eventsByTag.clear()
    this.eventsByDay.clear()
    this.eventsByAuthor.clear()
    this.eventsByKind.clear()
    this.deletes.clear()
    this.deletedBy.clear()
    this.expired.clear()
    this.replaced.clear()
    this.emit("clear")
  }

  load = (events: TrustedEvent[]) => {
    const updates: RepositoryUpdate[] = []

    for (const event of events) {
      const update = this._publish(event)

      if (update) {
        updates.push(update)
      }
    }

    this._emitUpdates(updates)
  }

  // API

  getEvent = (idOrAddress: string) => {
    return idOrAddress.includes(":")
      ? this.eventsByAddress.get(idOrAddress)
      : this.eventsById.get(idOrAddress)
  }

  hasEvent = (event: TrustedEvent) => {
    const duplicate = this.eventsById.get(event.id) || this.eventsByAddress.get(getAddress(event))

    return Boolean(duplicate && duplicate.created_at >= event.created_at)
  }

  removeEvent = (idOrAddress: string) => {
    const event = this.getEvent(idOrAddress)

    if (event) {
      this.eventsById.delete(event.id)
      this.expired.delete(event.id)

      // Only touch the address index (and restore what this event superseded) if this
      // event is still the current occupant — it may have already been replaced itself.
      const address = getAddress(event)
      const isCurrent = this.eventsByAddress.get(address) === event

      if (isCurrent) {
        this.eventsByAddress.delete(address)
      }

      this._unindex(event)

      // Put back whatever this event superseded, unless it was itself removed in the meantime
      const replaced = mapPop(event.id, this.replaced)

      if (isCurrent && replaced && this.eventsById.get(replaced.id) === replaced) {
        this.eventsByAddress.set(getAddress(replaced), replaced)
        this._reindex(replaced)
      }

      // Drop every delete this event asserted — its own tags, and the implicit delete of
      // anything it replaced — and report whatever that uncovers
      const added = this._undelete(event.id)

      this.emit("update", {added, removed: new Set([event.id])})
    }
  }

  query = (
    filters: Filter[],
    {
      includeDeleted = false,
      includeExpired = false,
      shouldSort = true,
      where,
    }: Partial<QueryOptions> = {},
  ) => {
    const options = {includeDeleted, includeExpired, shouldSort, where}
    const result = filters.map(filter => this._queryOne(filter, options))

    // Only re-sort if we had multiple filters, or if our single filter wasn't sorted
    const shouldSortAll = shouldSort && (filters.length > 1 || !filters[0]?.limit)

    return this._sortEvents(shouldSortAll, uniq(flatten(result)))
  }

  publish = (event: TrustedEvent, {shouldNotify = true} = {}): boolean => {
    const update = this._publish(event)

    if (update && shouldNotify) {
      this._emitUpdates([update])
    }

    return Boolean(update)
  }

  // No created_at comparison: an id names one immutable event, so there is no newer version for it
  // to protect, and comparing would strand anything taken back in the same second it was made.
  isDeletedById = (event: TrustedEvent) =>
    some(spec({pubkey: event.pubkey}), this.deletes.get(event.id) || [])

  // Unlike an id, an address can be republished after a delete was issued, and that newer version
  // is not the one the delete asked about.
  isDeletedByAddress = (event: TrustedEvent) =>
    some(
      ({pubkey, created_at}) => pubkey === event.pubkey && created_at > event.created_at,
      this.deletes.get(getAddress(event)) || [],
    )

  isDeleted = (event: TrustedEvent) => this.isDeletedById(event) || this.isDeletedByAddress(event)

  isExpired = (event: TrustedEvent) => {
    const ts = this.expired.get(event.id)

    return Boolean(ts && ts < now())
  }

  // Utilities

  _sortEvents = (shouldSort: boolean, events: TrustedEvent[]) =>
    shouldSort ? sortEventsDesc(events) : events

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

    if (a.length > 0) {
      m.set(k, a)
    } else {
      m.delete(k)
    }
  }

  // A page with a ceiling comes from the day index, which bounds the work to the window
  _queryOne = (filter: Filter, options: QueryOptions) =>
    filter.limit && filter.until
      ? this._queryDays(filter, options)
      : this._queryIndex(filter, options)

  // Every event in a day bucket is newer than every event below it, so a full page ends the walk
  _queryDays = (filter: Filter, options: QueryOptions) => {
    const limit = filter.limit || Infinity
    const sinceDay = getDay(filter.since || EPOCH)
    const untilDay = getDay(filter.until || now())
    const found: TrustedEvent[] = []

    for (let day = untilDay; day >= sinceDay && found.length < limit; day--) {
      for (const event of sortEventsDesc(this.eventsByDay.get(day) || [])) {
        if (found.length >= limit) {
          break
        }

        if (this._isIncluded(event, options) && matchFilter(filter, event)) {
          found.push(event)
        }
      }
    }

    return found
  }

  _queryIndex = (originalFilter: Filter, options: QueryOptions) => {
    // Attempt to fulfill the query using one of our indexes. Fall back to all events.
    const applied = this._applyAnyFilter(originalFilter)
    const filter = applied?.filter || originalFilter
    const events = applied ? this._getEvents(applied.ids) : this.dump()
    const sorted = this._sortEvents(options.shouldSort || Boolean(filter.limit), events)
    const found: TrustedEvent[] = []

    for (const event of sorted) {
      if (filter.limit && found.length >= filter.limit) {
        break
      }

      if (this._isIncluded(event, options) && matchFilter(filter, event)) {
        found.push(event)
      }
    }

    return found
  }

  _isIncluded = (event: TrustedEvent, {includeDeleted, includeExpired, where}: QueryOptions) =>
    (includeDeleted || !this.isDeleted(event)) &&
    (includeExpired || !this.isExpired(event)) &&
    (!where || where(event))

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

  // Store `event`, returning the update it causes, or undefined if nothing changed
  _publish = (event: TrustedEvent): RepositoryUpdate | undefined => {
    if (!event?.id) {
      console.warn("Attempted to publish invalid event to repository", event)

      return undefined
    }

    const existing = this.eventsById.get(event.id)

    // An event we hold can come back changed, most often an unsigned one carrying its signature
    if (existing) {
      if (equals(existing, event)) {
        return undefined
      }

      this._replaceEvent(existing, event)

      return {added: [event], removed: new Set<string>()}
    }

    const removed = new Set<string>()
    const address = getAddress(event)
    const duplicate = this.eventsByAddress.get(address)

    if (duplicate) {
      // If our event is younger than the duplicate, we're done
      if (event.created_at < duplicate.created_at) {
        return undefined
      }

      // If our event is newer than what it's replacing, delete the old version
      this._delete(event, duplicate.id)

      // Notify listeners that it's been removed
      removed.add(duplicate.id)

      // Remember what this event replaced so it can be restored if this event is later removed
      this.replaced.set(event.id, duplicate)
    }

    // Add our new event by id
    this.eventsById.set(event.id, event)

    // Add our new event by address
    if (isReplaceable(event)) {
      this.eventsByAddress.set(address, event)
    }

    // Update our timestamp, author, kind, and tag indexes
    this._reindex(event, duplicate)

    // Handle delete/expiration bookkeeping, which only applies when newly publishing
    for (const tag of event.tags) {
      if (tag[0]?.length === 1) {
        // If this is a delete event, the tag value is an id or address. Track when it was
        // deleted so that replaceables can be restored.
        if (event.kind === DELETE && ["a", "e"].includes(tag[0]) && tag[1]) {
          this._delete(event, tag[1])

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

    return {added: [event], removed}
  }

  // Emit `updates` as one, reporting anything stored already deleted, expired or superseded as removed
  _emitUpdates = (updates: RepositoryUpdate[]) => {
    const merged = mergeRepositoryUpdates(updates)
    const added: TrustedEvent[] = []

    for (const event of merged.added) {
      if (this._isVisible(event)) {
        added.push(event)
      } else {
        merged.removed.add(event.id)
      }
    }

    this.emit("update", {added, removed: merged.removed})
  }

  // Swap `event` in where `existing` sat; removing and re-adding it blinks it out of derived stores
  _replaceEvent = (existing: TrustedEvent, event: TrustedEvent) => {
    const address = getAddress(event)
    const isCurrent = this.eventsByAddress.get(address) === existing

    // A superseded replaceable was evicted from the secondary indexes and must stay out.
    const isIndexed = isCurrent || !isReplaceable(existing)

    this.eventsById.set(event.id, event)

    if (isCurrent) {
      this.eventsByAddress.set(address, event)
    }

    if (isIndexed) {
      this._reindex(event, existing)
    }
  }

  // Insert `event` into the day/author/kind/tag indexes, optionally evicting `remove` from them
  _reindex = (event: TrustedEvent, remove?: TrustedEvent) => {
    this._updateIndex(this.eventsByDay, getDay(event.created_at), event, remove)
    this._updateIndex(this.eventsByAuthor, event.pubkey, event, remove)
    this._updateIndex(this.eventsByKind, event.kind, event, remove)

    for (const tag of event.tags) {
      if (tag[0]?.length === 1) {
        this._updateIndex(this.eventsByTag, tag.slice(0, 2).join(":"), event, remove)
      }
    }
  }

  // Evict `event` from the day/author/kind/tag indexes
  _unindex = (event: TrustedEvent) => {
    this._updateIndex(this.eventsByDay, getDay(event.created_at), undefined, event)
    this._updateIndex(this.eventsByAuthor, event.pubkey, undefined, event)
    this._updateIndex(this.eventsByKind, event.kind, undefined, event)

    for (const tag of event.tags) {
      if (tag[0]?.length === 1) {
        this._updateIndex(this.eventsByTag, tag.slice(0, 2).join(":"), undefined, event)
      }
    }
  }

  // Record that `event` deletes `key` (an id or address), keeping the reverse index that
  // lets the assertion be withdrawn if `event` is later removed
  _delete = (event: TrustedEvent, key: string) => {
    pushToMapKey(this.deletes, key, pick(["id", "pubkey", "created_at"], event))
    pushToMapKey(this.deletedBy, event.id, key)
  }

  // Withdraw every delete asserted by `id`, returning the events that became visible again
  _undelete = (id: string) => {
    const added: TrustedEvent[] = []

    for (const key of mapPop(id, this.deletedBy) || []) {
      const target = this.getEvent(key)
      const wasVisible = Boolean(target && this._isVisible(target))
      const records = (this.deletes.get(key) || []).filter(record => record.id !== id)

      if (records.length > 0) {
        this.deletes.set(key, records)
      } else {
        this.deletes.delete(key)
      }

      if (target && !wasVisible && this._isVisible(target)) {
        added.push(target)
      }
    }

    return added
  }

  // An event is visible if it's still indexed, still the current version, and not hidden
  _isVisible = (event: TrustedEvent) =>
    this.eventsById.get(event.id) === event &&
    !this.isDeleted(event) &&
    !this.isExpired(event) &&
    (!isReplaceable(event) || this.eventsByAddress.get(getAddress(event)) === event)
}
