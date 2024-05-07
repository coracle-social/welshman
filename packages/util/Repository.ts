import {throttle} from 'throttle-debounce'
import type {Readable, Subscriber, Invalidator} from '@welshman/lib'
import {Derived, Emitter, writable, first, always, chunk, sleep, uniq, omit, now, range, identity} from '@welshman/lib'
import {Kind} from './Kinds'
import {matchFilter, getIdFilters, matchFilters} from './Filters'
import {encodeAddress, addressFromEvent} from './Address'
import {isReplaceable} from './Events'
import type {Filter} from './Filters'
import type {Rumor} from './Events'

export const DAY = 86400

const getDay = (ts: number) => Math.floor(ts / DAY)

export type RepositoryOptions = {
  throttle?: number
}

export class Repository<E extends Rumor> extends Emitter implements Readable<Repository<E>> {
  eventsById = new Map<string, E>()
  eventsByAddress = new Map<string, E>()
  eventsByTag = new Map<string, E[]>()
  eventsByDay = new Map<number, E[]>()
  eventsByAuthor = new Map<string, E[]>()
  deletes = new Map<string, number>()
  subs: Subscriber<typeof this>[] = []

  constructor(private options: RepositoryOptions) {
    super()

    if (options.throttle) {
      this.notify = throttle(options.throttle, this.notify.bind(this))
    }
  }

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

  filter(getFilters: () => Filter[]) {
    const store = writable<E[]>([])

    const onNotify = (event?: E) => {
      const filters = getFilters()

      if (!event || matchFilters(filters, event)) {
        store.set(Array.from(this.query(filters)))
      }
    }

    const subscribe = store.subscribe.bind(store)

    store.subscribe = (f: Subscriber<E[]>) => {
      if (store.subs.length === 0) {
        this.on('notify', onNotify)
        onNotify()
      }

      const unsubscribe = subscribe(f)

      return () => {
        unsubscribe()

        if (store.subs.length === 0) {
          this.off('notify', onNotify)
        }
      }
    }

    return store
  }

  notify(event?: E) {
    for (const sub of this.subs) {
      sub(this)
    }

    this.emit('notify', event)
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

  watchEvent(idOrAddress: string) {
    return this.filter(always(getIdFilters([idOrAddress]))).derived(first)
  }

  *query(filters: Filter[]) {
    for (let filter of filters) {
      let events: Iterable<E> = this.eventsById.values()

      if (filter.ids) {
        events = filter.ids!.map(id => this.eventsById.get(id)).filter(identity) as E[]
        filter = omit(['ids'], filter)
      } else if (filter.authors) {
        events = uniq(filter.authors!.flatMap(pubkey => this.eventsByAuthor.get(pubkey) || []))
        filter = omit(['authors'], filter)
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

        if (event.kind === Kind.Delete) {
          const id = tag[1]
          const ts = Math.max(event.created_at, this.deletes.get(tag[1]) || 0)

          this.deletes.set(id, ts)
        }
      }
    }

    if (!this.isDeleted(event)) {
      // Deletes are tricky, re-evaluate all subscriptions if that's what we're dealing with
      if (event.kind === Kind.Delete) {
        this.notify()
      } else {
        this.notify(event)
      }
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
