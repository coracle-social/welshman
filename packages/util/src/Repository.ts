import {flatten, Emitter, sortBy, inc, chunk, sleep, uniq, omit, now, range, identity} from '@welshman/lib'
import {DELETE} from './Kinds'
import {EPOCH, matchFilter} from './Filters'
import {isReplaceable, isTrustedEvent} from './Events'
import {getAddress} from './Address'
import type {Filter} from './Filters'
import type {CustomEvent} from './Events'

export const DAY = 86400

const getDay = (ts: number) => Math.floor(ts / DAY)

export class Repository extends Emitter {
  eventsById = new Map<string, CustomEvent>()
  eventsByWrap = new Map<string, CustomEvent>()
  eventsByAddress = new Map<string, CustomEvent>()
  eventsByTag = new Map<string, CustomEvent[]>()
  eventsByDay = new Map<number, CustomEvent[]>()
  eventsByAuthor = new Map<string, CustomEvent[]>()
  deletes = new Map<string, number>()

  // Dump/load/clear

  dump = () => {
    return Array.from(this.eventsById.values())
  }

  load = async (events: CustomEvent[], chunkSize = 1000) => {
    this.clear()

    const added = []

    for (const eventsChunk of chunk(chunkSize, events)) {
      for (const event of eventsChunk) {
        if (this.publish(event, {shouldNotify: false})) {
          added.push(event)
        }
      }

      if (eventsChunk.length === chunkSize) {
        await sleep(1)
      }
    }

    const removed = new Set(this.deletes.keys())

    this.emit('update', {added, removed})
  }

  clear = () => {
    const removed = new Set(this.eventsById.keys())

    this.eventsById.clear()
    this.eventsByWrap.clear()
    this.eventsByAddress.clear()
    this.eventsByTag.clear()
    this.eventsByDay.clear()
    this.eventsByAuthor.clear()
    this.deletes.clear()

    this.emit('update', {added: [], removed})
  }

  // API

  getEvent = (idOrAddress: string) => {
    return idOrAddress.includes(':')
      ? this.eventsByAddress.get(idOrAddress)
      : this.eventsById.get(idOrAddress)
  }

  hasEvent = (event: CustomEvent) => {
    const duplicate = (
      this.eventsById.get(event.id) ||
      this.eventsByAddress.get(getAddress(event))
    )

    return duplicate && duplicate.created_at >= event.created_at
  }

  query = (filters: Filter[], {includeDeleted = false} = {}) => {
    const result: CustomEvent[][] = []
    for (let filter of filters) {
      let events: CustomEvent[] = Array.from(this.eventsById.values())

      if (filter.ids) {
        events = filter.ids!.map(id => this.eventsById.get(id)).filter(identity) as CustomEvent[]
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

      const chunk: CustomEvent[] = []
      for (const event of sortBy((e: CustomEvent) => -e.created_at, events)) {
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

  publish = (event: CustomEvent, {shouldNotify = true} = {}): boolean => {
    if (!isTrustedEvent(event)) {
      throw new Error("Invalid event published to Repository", event)
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
    if (event.wrap) {
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

  isDeletedByAddress = (event: CustomEvent) => (this.deletes.get(getAddress(event)) || 0) > event.created_at

  isDeletedById = (event: CustomEvent) => (this.deletes.get(event.id) || 0) > event.created_at

  isDeleted = (event: CustomEvent) => this.isDeletedByAddress(event) || this.isDeletedById(event)

  // Utilities

  _updateIndex<K>(m: Map<K, CustomEvent[]>, k: K, e: CustomEvent, duplicate?: CustomEvent) {
    let a = m.get(k) || []

    if (duplicate) {
      a = a.filter((x: CustomEvent) => x !== duplicate)
    }

    a.push(e)
    m.set(k, a)
  }
}
