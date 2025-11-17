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

// General purpose utils

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

export type CollectionUpdate<T> = {
  added?: T
  removed?: T
  initial?: Map<string, T>
}

export interface Collection2Backend<T> {
  name: string,
  index: Map<string, T>
  load: (key: string, ...args: unknown[]) => Promise<Maybe<T>>
  subscribe: (sub?: (update: CollectionUpdate<T>) => void) => Unsubscriber
  add?: (item: T) => void
  remove?: (key: string) => void
}

// Repository backend

export type CollectionRepositoryBackendOptions<T> = {
  filters: Filter[]
  repository: Repository
  getKey: (item: T) => string
  fetch: (key: string, ...args: any[]) => Promise<unknown>
  eventToItem: (event: TrustedEvent) => MaybeAsync<Maybe<T | T[]>>
  itemToEvent: (item: T) => TrustedEvent
  includeDeleted?: boolean
}

export class CollectionRepositoryBackend<T> {
  index = new Map<string, T>()
  mapping = new Map<string, string[]>()
  deferred = new Set<string>()
  subscribers: Subscriber<CollectionUpdate<T>>[] = []
  unsubscriber: Unsubscriber | undefined
  load: (key: string, ...args: any[]) => Promise<Maybe<T>>

  constructor(readonly name: string, readonly options: CollectionRepositoryBackendOptions<T>) {
    const initialEvents = options.repository.query(options.filters, {
      includeDeleted: options.includeDeleted,
    })

    for (const event of initialEvents) {
      this._addEvent(event)
    }

    this.load = makeCachedLoader2({
      name: this.name,
      index: this.index,
      fetch: options.fetch,
    })
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
      this.unsubscriber = on(this.options.repository, "update", ({added, removed}) => {
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
}

// Loader backend

type CollectionLoaderBackendOptions<T> = {
  getKey: (item: T) => string
  fetch: (key: string, ...args: any[]) => Promise<Maybe<T>>
}

export class CollectionLoaderBackend<T> {
  index = new Map<string, T>()
  mapping = new Map<string, string[]>()
  deferred = new Set<string>()
  subscribers: Subscriber<CollectionUpdate<T>>[] = []
  load: (key: string, ...args: any[]) => Promise<Maybe<T>>

  constructor(readonly name: string, readonly options: CollectionLoaderBackendOptions<T>) {
    this.load = makeCachedLoader2({
      name: this.name,
      index: this.index,
      fetch: async (key: string, ...args: unknown[]) => {
        const item = await options.fetch(key, ...args)

        if (item) {
          this.add(item)
        }
      },
    })
  }

  _notify = (update: CollectionUpdate<T>) => {
    for (const sub of this.subscribers) {
      sub(update)
    }
  }

  add = (item: T) => {
    this.index.set(this.options.getKey(item), item)
    this._notify({added: item})
  }

  remove = (key: string) => {
    const item = this.index.get(key)

    if (item) {
      this.index.delete(key)
      this._notify({removed: item})
    }
  }

  subscribe = (sub: (update: CollectionUpdate<T>) => void = noop) => {
    this.subscribers.push(sub)

    sub({initial: this.index})

    return () => {
      this.subscribers.splice(
        this.subscribers.findIndex(s => s === sub),
        1,
      )
    }
  }
}

// Collection wrapper class

export type Collection2Options<T> = {
  backend: Collection2Backend<T>
}

export class Collection2<T> {
  all$: Readable<T[]>
  index$: Readable<Map<string, T>>

  constructor(public options: Collection2Options<T>) {
    this.all$ = derived(this.options.backend, this.all)
    this.index$ = derived(this.options.backend, () => this.index)
  }

  get index() {
    return this.options.backend.index
  }

  get load() {
    return this.options.backend.load
  }

  get subscribe() {
    return this.options.backend.subscribe
  }

  add = (item: T) => {
    if (!this.options.backend.add) {
      throw new Error(`Backend ${this.options.backend.name} does not support add() method`)
    }

    this.options.backend.add(item)
  }

  remove = (key: string) => {
    if (!this.options.backend.remove) {
      throw new Error(`Backend ${this.options.backend.name} does not support remove() method`)
    }

    this.options.backend.remove(key)
  }

  all = () => Array.from(this.index.values())

  one = (key: string) => this.index.get(key)

  one$ = (key: string, ...args: any[]) => {
    this.options.backend.load(key, ...args)

    return derived(this.options.backend, () => this.one(key))
  }
}
