import {derived, Subscriber, Readable, Unsubscriber} from "svelte/store"
import {
  noop,
  removeUndefined,
  on,
  ensurePlural,
  pushToMapKey,
  now,
  MaybeAsync,
  Maybe,
} from "@welshman/lib"
import {Filter, matchFilters, TrustedEvent} from "@welshman/util"
import {Repository} from "@welshman/net"
import {getFreshness, setFreshness} from "./freshness.js"

export type CachedLoader2Options<T> = {
  name: string
  index: Map<string, T>
  fetch: (key: string, relays: string[]) => Promise<unknown>
}

export const makeCachedLoader2 = <T>({name, fetch, index}: CachedLoader2Options<T>) => {
  const pending = new Map<string, Promise<unknown>>()
  const loadAttempts = new Map<string, number>()

  return async (key: string, relays: string[] = [], force = false) => {
    const stale = index.get(key)

    // If we have no loader function, nothing we can do
    if (!fetch) {
      return stale
    }

    const freshness = getFreshness(name, key)

    // If we have an item, reload if it's stale
    if (stale && freshness > now() - 3600 && !force) {
      return stale
    }

    // If we already are loading, await and return
    if (pending.has(key)) {
      return pending.get(key)!.then(() => index.get(key))
    }

    const attempt = loadAttempts.get(key) || 0

    // Use exponential backoff to throttle attempts
    if (freshness > now() - Math.pow(2, attempt) && !force) {
      return stale
    }

    loadAttempts.set(key, attempt + 1)

    setFreshness(name, key, now())

    const promise = fetch(key, relays)

    pending.set(key, promise)

    try {
      await promise
    } catch (e) {
      console.warn(`Failed to load ${name} item ${key}`, e)
    } finally {
      pending.delete(key)
    }

    const fresh = index.get(key)

    if (fresh) {
      loadAttempts.delete(key)
    }

    return fresh
  }
}

type Collection2Options<T> = {
  name: string
  filters: Filter[]
  getKey: (item: T) => string
  fetch: (key: string, ...args: any[]) => Promise<unknown>
  eventToItem: (event: TrustedEvent) => MaybeAsync<Maybe<T | T[]>>
  itemToEvent: (item: T) => TrustedEvent
  includeDeleted?: boolean
}

type CollectionUpdate<T> = {
  added?: T
  removed?: T
  initial?: Map<string, T>
}

export class Collection2<T> {
  index = new Map<string, T>()
  mapping = new Map<string, string[]>()
  deferred = new Set<string>()
  subscribers: Subscriber<CollectionUpdate<T>>[] = []
  unsubscriber: Unsubscriber | undefined
  load: (key: string, ...args: any[]) => Promise<Maybe<T>>
  all$: Readable<T[]>
  index$: Readable<Map<string, T>>

  constructor(
    readonly repository: Repository,
    readonly options: Collection2Options<T>,
  ) {
    const initialEvents = repository.query(options.filters, {
      includeDeleted: options.includeDeleted,
    })

    for (const event of initialEvents) {
      this._addEvent(event)
    }

    this.load = makeCachedLoader2({
      name: options.name,
      fetch: options.fetch,
      index: this.index,
    })

    this.all$ = derived(this, this.all)
    this.index$ = derived(this, () => this.index)
  }

  _addItem = (item: T) => {
    const key = this.options.getKey(item)
    const event = this.options.itemToEvent(item)

    this.index.set(key, item)

    pushToMapKey(this.mapping, event.id, key)

    for (const subscriber of this.subscribers) {
      subscriber({added: item})
    }
  }

  _deferMapping = (event: TrustedEvent, promise: Promise<Maybe<T | T[]>>) => {
    this.deferred.add(event.id)

    promise.then(items => {
      if (this.deferred.has(event.id)) {
        this.deferred.delete(event.id)

        for (const item of removeUndefined(ensurePlural(items))) {
          this._addItem(item)
        }
      }
    })
  }

  _addEvent = (event: TrustedEvent) => {
    if (this.mapping.has(event.id)) return

    const items = this.options.eventToItem(event)

    if (items instanceof Promise) {
      this._deferMapping(event, items)
    } else if (items) {
      for (const item of removeUndefined(ensurePlural(items))) {
        this._addItem(item)
      }
    }
  }

  _removeEvent = (id: string) => {
    const keys = this.mapping.get(id)

    if (keys) {
      this.mapping.delete(id)

      for (const key of keys) {
        const item = this.index.get(key)!

        for (const subscriber of this.subscribers) {
          subscriber({removed: item})
        }

        this.index.delete(key)
      }
    }

    this.deferred.delete(id)
  }

  subscribe = (sub: (update: CollectionUpdate<T>) => void = noop) => {
    this.subscribers.push(sub)

    sub({initial: this.index})

    if (!this.unsubscriber) {
      this.unsubscriber = on(this.repository, "update", ({added, removed}) => {
        for (const event of added) {
          if (matchFilters(this.options.filters, event)) {
            this._addEvent(event)
          }
        }

        if (!this.options.includeDeleted) {
          for (const id of removed) {
            this._removeEvent(id)
          }
        }
      })
    }

    return () => {
      this.subscribers.splice(
        this.subscribers.findIndex(s => s === sub),
        1,
      )

      if (this.subscribers.length === 0) {
        this.unsubscriber!()
      }
    }
  }

  all = () => Array.from(this.index.values())

  one = (key: string) => this.index.get(key)

  one$ = (key: string, ...args: any[]) => {
    this.load(key, ...args)

    return derived(this, () => this.one(key))
  }
}
