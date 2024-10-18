import {flatten, Emitter, sortBy, inc, chunk, uniq, omit, now, range, identity} from '@welshman/lib'
import {DELETE} from './Kinds'
import {EPOCH, matchFilter} from './Filters'
import {isReplaceable, isUnwrappedEvent} from './Events'
import {getAddress} from './Address'
import type {Filter} from './Filters'
import type {TrustedEvent, HashedEvent} from './Events'

export const DAY = 86400

const getDay = (ts: number) => Math.floor(ts / DAY)

export class Repository<E extends HashedEvent = TrustedEvent> extends Emitter {
  eventsById = new Map<string, E>()
  eventsByWrap = new Map<string, E>()
  eventsByAddress = new Map<string, E>()
  eventsByTag = new Map<string, E[]>()
  eventsByDay = new Map<number, E[]>()
  eventsByAuthor = new Map<string, E[]>()
  deletes = new Map<string, number>()

  constructor() {
    super()

    this.setMaxListeners(100)
  }

  // Dump/load/clear

  dump = () => {
    return Array.from(this.eventsById.values())
  }

  load = (events: E[], chunkSize = 1000) => {
    const added = []
    const removed = new Set(this.eventsById.keys())

    this.eventsById.clear()
    this.eventsByWrap.clear()
    this.eventsByAddress.clear()
    this.eventsByTag.clear()
    this.eventsByDay.clear()
    this.eventsByAuthor.clear()
    this.deletes.clear()

    for (const eventsChunk of chunk(chunkSize, events)) {
      for (const event of eventsChunk) {
        if (this.publish(event, {shouldNotify: false})) {
          added.push(event)
          removed.delete(event.id)
        }
      }
    }

    for (const id of this.deletes.keys()) {
      removed.add(id)
    }

    this.emit('update', {added, removed})
  }

  // API

  getEvent = (idOrAddress: string) => {
    return idOrAddress.includes(':')
      ? this.eventsByAddress.get(idOrAddress)
      : this.eventsById.get(idOrAddress)
  }

  hasEvent = (event: E) => {
    const duplicate = (
      this.eventsById.get(event.id) ||
      this.eventsByAddress.get(getAddress(event))
    )

    return duplicate && duplicate.created_at >= event.created_at
  }

  removeEvent = (idOrAddress: string) => {
    const event = this.getEvent(idOrAddress)

    if (event) {
      this.eventsById.delete(event.id)

      if (isUnwrappedEvent(event)) {
        this.eventsByWrap.delete(event.wrap.id)
      }

      this.eventsByAddress.delete(getAddress(event))

      for (const [k, v] of event.tags) {
        if (k.length === 1) {
          this._updateIndex(this.eventsByTag, `${k}:${v}`, undefined, event)
        }
      }

      this._updateIndex(this.eventsByDay, getDay(event.created_at), undefined, event)
      this._updateIndex(this.eventsByAuthor, event.pubkey, undefined, event)

      this.emit('update', {added: [], removed: [event.id]})
    }
  }

  query = (filters: Filter[], {includeDeleted = false} = {}) => {
    const result: E[][] = []
    for (let filter of filters) {
      let events: E[] = Array.from(this.eventsById.values())

      if (filter.ids) {
        events = filter.ids!.map(id => this.eventsById.get(id)).filter(identity) as E[]
        filter = omit(['ids'], filter)
      } else if (filter.authors) {
        events = uniq(filter.authors!.flatMap(pubkey => this.eventsByAuthor.get(pubkey) || []))
        filter = omit(['authors'], filter)
      } else if (filter.since || filter.until) {
        const sinceDay = getDay(filter.since || EPOCH)
        const untilDay = getDay(filter.until || now())

        events = uniq(
          Array.from(range(sinceDay, inc(untilDay)))
            .flatMap((day: number) => this.eventsByDay.get(day) || [])
        )
      } else {
        for (const [k, values] of Object.entries(filter)) {
          if (!k.startsWith('#') || k.length !== 2) {
            continue
          }

          filter = omit([k], filter)
          events = uniq(
            (values as string[]).flatMap(v => this.eventsByTag.get(`${k[1]}:${v}`) || [])
          )

          break
        }
      }

      const chunk: E[] = []
      for (const event of sortBy((e: E) => -e.created_at, events)) {
        if (filter.limit && chunk.length >= filter.limit) {
          break
        }

        if (!includeDeleted && this.isDeleted(event)) {
          continue
        }

        if (matchFilter(filter, event)) {
          chunk.push(event)
        }
      }

      result.push(chunk)
    }

    return uniq(flatten(result))
  }

  publish = (event: E, {shouldNotify = true} = {}): boolean => {
    if (!event?.id) {
      console.warn("Attempted to publish invalid event to repository", event)

      return false
    }

    // If we've already seen this event, or it's been deleted, we're done
    if (this.eventsById.get(event.id) || this.isDeleted(event)) {
      return false
    }

    const removed = new Set<string>()
    const address = getAddress(event)
    const duplicate = this.eventsByAddress.get(address)

    if (duplicate) {
      // If our event is older than the duplicate, we're done
      if (event.created_at <= duplicate.created_at) {
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

    // Save wrapper index
    if (isUnwrappedEvent(event)) {
      this.eventsByWrap.set(event.wrap.id, event)
    }

    // Update our timestamp and author indexes
    this._updateIndex(this.eventsByDay, getDay(event.created_at), event, duplicate)
    this._updateIndex(this.eventsByAuthor, event.pubkey, event, duplicate)

    // Update our tag indexes
    for (const tag of event.tags) {
      if (tag[0]?.length === 1) {
        this._updateIndex(this.eventsByTag, tag.slice(0, 2).join(':'), event, duplicate)

        // If this is a delete event, the tag value is an id or address. Track when it was
        // deleted so that replaceables can be restored.
        if (event.kind === DELETE) {
          this.deletes.set(tag[1], Math.max(event.created_at, this.deletes.get(tag[1]) || 0))

          const deletedEvent = this.getEvent(tag[1])

          if (deletedEvent && this.isDeleted(deletedEvent)) {
            removed.add(deletedEvent.id)
          }
        }
      }
    }

    if (shouldNotify) {
      this.emit('update', {added: [event], removed})
    }

    return true
  }

  isDeletedByAddress = (event: E) => (this.deletes.get(getAddress(event)) || 0) > event.created_at

  isDeletedById = (event: E) => (this.deletes.get(event.id) || 0) > event.created_at

  isDeleted = (event: E) => this.isDeletedByAddress(event) || this.isDeletedById(event)

  // Utilities

  _updateIndex<K>(m: Map<K, E[]>, k: K, add?: E, remove?: E) {
    let a = m.get(k) || []

    if (remove) {
      a = a.filter((x: E) => x !== remove)
    }

    if (add) {
      a.push(add)
    }

    m.set(k, a)
  }
}
