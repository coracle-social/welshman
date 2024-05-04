import type {Readable, Subscriber, Invalidator} from '@welshman/lib'
import {Derived, chunk, sleep, uniq, omit, now, range, identity} from '@welshman/lib'
import {matchFilter} from './Filters'
import {encodeAddress, addressFromEvent} from './Address'
import {isReplaceable} from './Events'
import type {Filter} from './Filters'
import type {Rumor} from './Events'

export const DAY = 86400

const getDay = (ts: number) => Math.floor(ts / DAY)

export class Repository<E extends Rumor> implements Readable<Repository<E>> {
  eventsById = new Map<string, E>()
  eventsByAddress = new Map<string, E>()
  eventsByTag = new Map<string, E[]>()
  eventsByDay = new Map<number, E[]>()
  eventsByAuthor = new Map<string, E[]>()
  deletes = new Map<string, number>()
  subs: Subscriber<typeof this>[] = []

  // Methods for implementing store interface

  get() {
    return this
  }

  subscribe(f: Subscriber<Repository<E>>, invalidate?: Invalidator<Repository<E>>) {
    this.subs.push(f)

    return () => {
      this.subs = this.subs.filter(sub => sub !== f)
    }
  }

  derived<U>(f: (v: Repository<E>) => U): Derived<U> {
    return new Derived<U>(this, f)
  }

  throttle(t: number): Derived<Repository<E>> {
    return new Derived<Repository<E>>(this, identity, t)
  }

  notify() {
    for (const sub of this.subs) {
      sub(this)
    }
  }

  // Load/dump

  dump() {
    return Array.from(this.eventsById.values())
  }

  async load(events: E[], chunkSize = 1000) {
    for (const eventsChunk of chunk(chunkSize, events)) {
      for (const event of eventsChunk) {
        this._addEvent(event)
      }

      if (eventsChunk.length === chunkSize) {
        await sleep(1)
      }
    }

    this.notify()
  }

  // API

  getEvent(idOrAddress: string) {
    return idOrAddress.includes(':')
      ? this.eventsByAddress.get(idOrAddress)
      : this.eventsById.get(idOrAddress)
  }

  *query(filters: Filter[]) {
    for (let filter of filters) {
      let events: Iterable<E> = this.eventsById.values()

      if (filter.ids) {
        filter = omit(['ids'], filter)
        events = filter.ids!.map(id => this.eventsById.get(id)).filter(identity) as E[]
      } else if (filter.authors) {
        filter = omit(['authors'], filter)
        events = uniq(filter.authors!.flatMap(pubkey => this.eventsByAuthor.get(pubkey) || []))
      } else if (filter.since || filter.until) {
        const sinceDay = getDay(filter.since || 0)
        const untilDay = getDay(filter.since || now())

        filter = omit(['since', 'until'], filter)
        events = uniq(
          Array.from(range(sinceDay, untilDay))
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

      for (const event of events) {
        if (!this.isDeleted(event) && matchFilter(filter, event)) {
          yield event
        }
      }
    }
  }

  publish(event: E) {
    const duplicateById = this.eventsById.get(event.id)

    if (duplicateById) {
      return false
    }

    const hasAddress = isReplaceable(event)
    const address = encodeAddress(addressFromEvent(event))
    const duplicateByAddress = hasAddress ? this.eventsByAddress.get(address) : undefined

    if (duplicateByAddress && duplicateByAddress.created_at >= event.created_at) {
      return false
    }

    this._addEvent(event, duplicateByAddress)

    return true
  }

  isDeleted(event: E) {
    const idDeletedAt = this.deletes.get(event.id) || 0

    if (idDeletedAt > event.created_at) {
      return true
    }

    if (isReplaceable(event)) {
      const address = encodeAddress(addressFromEvent(event))
      const addressDeletedAt = this.deletes.get(address) || 0

      if (addressDeletedAt > event.created_at) {
        return true
      }
    }

    return false
  }

  // Implementation

  _addEvent(event: E, duplicate?: E) {
    this.eventsById.set(event.id, event)

    if (isReplaceable(event)) {
      this.eventsByAddress.set(encodeAddress(addressFromEvent(event)), event)
    }

    this._updateIndex(this.eventsByDay, getDay(event.created_at), event, duplicate)
    this._updateIndex(this.eventsByAuthor, event.pubkey, event, duplicate)

    for (const tag of event.tags) {
      if (tag[0].length === 1) {
        this._updateIndex(this.eventsByTag, tag.slice(0, 2).join(':'), event, duplicate)

        if (event.kind === 5) {
          const id = tag[1]
          const ts = Math.max(event.created_at, this.deletes.get(tag[1]) || 0)

          this.deletes.set(id, ts)
        }
      }
    }

    if (!this.isDeleted(event)) {
      this.notify()
    }
  }

  _updateIndex<K>(m: Map<K, E[]>, k: K, e: E, duplicate?: E) {
    let a = m.get(k) || []

    if (duplicate) {
      a = a.filter((x: E) => x !== duplicate)
    }

    a.push(e)
    m.set(k, a)
  }
}
