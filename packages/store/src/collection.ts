import {derived, Subscriber, Readable, Unsubscriber} from "svelte/store"
import {
  noop,
  removeUndefined,
  on,
  ensurePlural,
  addToMapKey,
  now,
  MaybeAsync,
  Maybe,
} from "@welshman/lib"
import {Filter, matchFilters, TrustedEvent} from "@welshman/util"
import {Repository} from "@welshman/net"
import {getFreshness, setFreshness} from "./freshness.js"
import {deriveIfChanged} from "./memoize.js"

// Collections combine a bunch of interleaved concerns into a single utility:
//
// - Ability to access values directly, or via reactive store
// - Efficient derivation from events repository
// - Emission of updates rather than all records allows for efficient downstream derivations
// - Auto fetching with deduplication and caching
//
// This could be decomposed into the following components:
// - Adapters to turn a data source into granular updates (event emitters -> observables)
// - Derivers that collect updates into values (collections, or a single value)
// - getters for syncing regular access with arbitrary stores
// - loader that takes load logic and combines it with a getter

// General purpose utils

export type CachedLoader2Options<T> = {
  name: string
  index: Map<string, T>
  fetch: (key: string, ...args: unknown[]) => Promise<unknown>
}

export const makeCachedLoader = <T>({name, fetch, index}: CachedLoader2Options<T>) => {
  const pending = new Map<string, Promise<unknown>>()
  const loadAttempts = new Map<string, number>()

  return async (key: string, ...args: unknown[]) => {
    const stale = index.get(key)

    // If we have no loader function, nothing we can do
    if (!fetch) {
      return stale
    }

    const freshness = getFreshness(name, key)

    // If we have an item, reload if it's stale
    if (stale && freshness > now() - 3600) {
      return stale
    }

    // If we already are loading, await and return
    if (pending.has(key)) {
      return pending.get(key)!.then(() => index.get(key))
    }

    const attempt = loadAttempts.get(key) || 0

    // Use exponential backoff to throttle attempts
    if (freshness > now() - Math.pow(2, attempt)) {
      return stale
    }

    loadAttempts.set(key, attempt + 1)

    setFreshness(name, key, now())

    const promise = fetch(key, ...args)

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
  updated?: T[]
  removed?: T[]
}

export type CollectionOptions<T> = {
  name: string
  add?: (item: T) => void
  remove?: (key: string) => void
  fetch?: (key: string, ...args: unknown[]) => Promise<unknown>
  start?: () => Unsubscriber
}

export class Collection<T> {
  index = new Map<string, T>()
  unsubscriber: Unsubscriber | undefined
  subscribers: Subscriber<CollectionUpdate<T>>[] = []
  load: (key: string, ...args: unknown[]) => Promise<Maybe<T>>
  all$: Readable<T[]>
  index$: Readable<Map<string, T>>

  constructor(private options: CollectionOptions<T>) {
    this.all$ = derived(this, this.all)
    this.index$ = derived(this, () => this.index)
    this.load = makeCachedLoader({
      name: options.name,
      index: this.index,
      fetch: this.forceLoad,
    })
  }

  get add() {
    if (this.options.add) {
      return this.options.add
    }

    throw new Error(`add method is not defined for collection "${this.options.name}"`)
  }

  get remove() {
    if (this.options.remove) {
      return this.options.remove
    }

    throw new Error(`remove method is not defined for collection "${this.options.name}"`)
  }

  all = () => Array.from(this.index.values())

  one = (key: string) => this.index.get(key)

  one$ = (key: string, ...args: any[]): Readable<Maybe<T>> => {
    this.load(key, ...args)

    return deriveIfChanged(this, () => this.one(key))
  }

  notify = (update: CollectionUpdate<T>) => {
    for (const sub of this.subscribers) {
      sub(update)
    }
  }

  forceLoad = async (key: string, ...args: unknown[]) => {
    await this.options.fetch?.(key, ...args)

    return this.one(key)
  }

  subscribe = (sub: (update: CollectionUpdate<T>) => void = noop) => {
    this.subscribers.push(sub)

    sub({updated: Array.from(this.index.values())})

    if (!this.unsubscriber) {
      this.unsubscriber = this.options.start?.()
    }

    return () => {
      this.subscribers.splice(
        this.subscribers.findIndex(s => s === sub),
        1,
      )

      if (this.subscribers.length === 0) {
        this.unsubscriber?.()
      }
    }
  }
}

export const makeCollection = <T>(options: CollectionOptions<T>) => new Collection(options)

// Repository collection factory

export type RepositoryCollectionOptions = {
  name: string
  filters: Filter[]
  repository: Repository
  onEvent: (event: TrustedEvent) => void
  onRemove?: (id: string) => void
  fetch?: (key: string, ...args: any[]) => Promise<unknown>
}

export const makeRepositoryCollection = <T>({
  name,
  fetch,
  filters,
  repository,
  onEvent,
  onRemove,
}: RepositoryCollectionOptions) => {
  for (const event of repository.query(filters, {includeDeleted: !onRemove})) {
    onEvent(event)
  }

  const collection = makeCollection<T>({
    name,
    fetch,
    start: () =>
      on(repository, "update", ({added, removed}) => {
        for (const event of added) {
          if (matchFilters(filters, event)) {
            onEvent(event)
          }
        }

        if (onRemove) {
          for (const id of removed) {
            onRemove(id)
          }
        }
      }),
  })

  return collection
}

// Simple repository collection factory

export type SimpleRepositoryCollectionOptions<T> = {
  name: string
  filters: Filter[]
  repository: Repository
  getKey: (item: T) => string
  eventToItem: (event: TrustedEvent) => MaybeAsync<Maybe<T | T[]>>
  itemToEvent: (item: T) => TrustedEvent
  fetch?: (key: string, ...args: any[]) => Promise<unknown>
}

export const makeSimpleRepositoryCollection = <T>({
  name,
  filters,
  repository,
  fetch,
  getKey,
  eventToItem,
  itemToEvent,
}: SimpleRepositoryCollectionOptions<T>) => {
  const mapping = new Map<string, Set<string>>()
  const deferred = new Set<string>()

  const addItem = (item: T) => {
    const key = getKey(item)
    const event = itemToEvent(item)

    collection.index.set(key, item)
    addToMapKey(mapping, event.id, key)
    collection.notify({updated: [item]})
  }

  const deferMapping = (event: TrustedEvent, promise: Promise<Maybe<T | T[]>>) => {
    deferred.add(event.id)

    promise.then(items => {
      if (deferred.has(event.id)) {
        deferred.delete(event.id)

        for (const item of removeUndefined(ensurePlural(items))) {
          addItem(item)
        }
      }
    })
  }

  const collection = makeRepositoryCollection<T>({
    name,
    fetch,
    filters,
    repository,
    onEvent: (event: TrustedEvent) => {
      if (mapping.has(event.id)) return

      const items = eventToItem(event)

      if (items instanceof Promise) {
        deferMapping(event, items)
      } else if (items) {
        for (const item of removeUndefined(ensurePlural(items))) {
          addItem(item)
        }
      }
    },
    onRemove: (id: string) => {
      const keys = mapping.get(id)

      if (keys) {
        const removed: T[] = []

        mapping.delete(id)

        for (const key of keys) {
          const item = collection.one(key)

          if (item) {
            removed.push(item)
            collection.index.delete(key)
          }
        }

        collection.notify({removed})
      }

      deferred.delete(id)
    },
  })

  return collection
}

// Loader collection

export type LoaderCollectionOptions<T> = {
  name: string
  getKey: (item: T) => string
  fetch: (key: string, ...args: any[]) => Promise<Maybe<T>>
}

export const makeLoaderCollection = <T>({name, fetch, getKey}: LoaderCollectionOptions<T>) => {
  const collection = makeCollection({
    name,
    add: (item: T) => {
      collection.index.set(getKey(item), item)
      collection.notify({updated: [item]})
    },
    remove: (key: string) => {
      const item = collection.index.get(key)

      if (item) {
        collection.index.delete(key)
        collection.notify({removed: [item]})
      }
    },
    fetch: async (key: string, ...args: unknown[]) => {
      const item = await fetch(key, ...args)

      if (item) {
        collection.add(item)
      }
    },
  })

  return collection
}
