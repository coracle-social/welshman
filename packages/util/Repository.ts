import {flatten, Emitter, sortBy, inc, chunk, sleep, uniq, omit, now, range, identity} from '@welshman/lib'
import {DELETE} from './Kinds'
import {EPOCH, matchFilter} from './Filters'
import {isReplaceable, isTrustedEvent} from './Events'
import {getAddress} from './Address'
import type {Filter} from './Filters'
import type {TrustedEvent} from './Events'

export const DAY = 86400

const getDay = (ts: number) => Math.floor(ts / DAY)

export class Repository extends Emitter {
  eventsById = new Map<string, TrustedEvent>()
  eventsByWrap = new Map<string, TrustedEvent>()
  eventsByAddress = new Map<string, TrustedEvent>()
  eventsByTag = new Map<string, TrustedEvent[]>()
  eventsByDay = new Map<number, TrustedEvent[]>()
  eventsByAuthor = new Map<string, TrustedEvent[]>()
  deletes = new Map<string, number>()

  // Dump/load/clear

  dump = () => {
    return Array.from(this.eventsById.values())
  }

  load = async (events: TrustedEvent[], chunkSize = 1000) => {
    this.clear()

    for (const eventsChunk of chunk(chunkSize, events)) {
      for (const event of eventsChunk) {
        this.publish(event, {shouldNotify: false})
      }

      if (eventsChunk.length === chunkSize) {
        await sleep(1)
      }
    }


    this.emit('update', {
      added: events.filter(e => !this.isDeleted(e)),
      removed: new Set(),
    })
  }

  clear = () => {
    this.eventsById.clear()
    this.eventsByWrap.clear()
    this.eventsByAddress.clear()
    this.eventsByTag.clear()
    this.eventsByDay.clear()
    this.eventsByAuthor.clear()
    this.deletes.clear()
  }

  // API

  getEvent = (idOrAddress: string) => {
    return idOrAddress.includes(':')
      ? this.eventsByAddress.get(idOrAddress)
      : this.eventsById.get(idOrAddress)
  }

  hasEvent = (event: TrustedEvent) => {
    const duplicate = (
      this.eventsById.get(event.id) ||
      this.eventsByAddress.get(getAddress(event))
    )

    return duplicate && duplicate.created_at >= event.created_at
  }

  query = (filters: Filter[], {includeDeleted = false} = {}) => {
    const result: TrustedEvent[][] = []
    for (let filter of filters) {
      let events: TrustedEvent[] = Array.from(this.eventsById.values())

      if (filter.ids) {
        events = filter.ids!.map(id => this.eventsById.get(id)).filter(identity) as TrustedEvent[]
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

      const chunk: TrustedEvent[] = []
      for (const event of sortBy((e: TrustedEvent) => -e.created_at, events)) {
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

  publish = (event: TrustedEvent, {shouldNotify = true} = {}) => {
    if (!isTrustedEvent(event)) {
      throw new Error("Invalid event published to Repository", event)
    }

    const address = getAddress(event)
    const duplicate = (
      this.eventsById.get(event.id) ||
      this.eventsByAddress.get(address)
    )

    // If our duplicate is newer than the event we're adding, we're done
    if (duplicate && duplicate.created_at >= event.created_at) {
      return
    }

    // Delete our duplicate
    if (duplicate) {
      this.deletes.set(duplicate.id, event.created_at)
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

    // Keep track of deleted events to notify about
    const removed = new Set<string>()

    // Update our tag indexes
    for (const tag of event.tags) {
      if (tag[0].length === 1) {
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

    if (duplicate) {
      removed.add(duplicate.id)
    }

    if (shouldNotify) {
      this.emit('update', {added: this.isDeleted(event) ? [] : [event], removed})
    }
  }

  isDeleted = (event: TrustedEvent) => {
    const deletedAt = (
      this.deletes.get(event.id) ||
      this.deletes.get(getAddress(event)) ||
      0
    )

    return deletedAt > event.created_at
  }

  // Utilities

  _updateIndex<K>(m: Map<K, TrustedEvent[]>, k: K, e: TrustedEvent, duplicate?: TrustedEvent) {
    let a = m.get(k) || []

    if (duplicate) {
      a = a.filter((x: TrustedEvent) => x !== duplicate)
    }

    a.push(e)
    m.set(k, a)
  }
}
