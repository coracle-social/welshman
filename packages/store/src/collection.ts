import {Unsubscriber, Subscriber, Readable, derived} from "svelte/store"
import {Maybe, MaybeAsync, isDefined, now, on} from "@welshman/lib"
import {Repository, RepositoryUpdate} from "@welshman/net"
import {Filter, TrustedEvent, matchFilters} from "@welshman/util"
import {getFreshness, setFreshness} from "./freshness.js"

// Subscription Manager

export type SubscriberManagerOptions = {
  start?: () => Unsubscriber
  stop?: () => void
}

export class SubscriberManager<T> {
  private subscribers: Subscriber<T>[] = []
  private unsubscriber: Unsubscriber | undefined

  constructor(private options: SubscriberManagerOptions) {}

  notify(item: T) {
    for (const sub of this.subscribers) {
      sub(item)
    }
  }

  subscribe(sub: Subscriber<T>) {
    this.subscribers.push(sub)

    if (!this.unsubscriber && this.options.start) {
      this.unsubscriber = this.options.start()
    }

    return () => {
      this.subscribers.splice(
        this.subscribers.findIndex(s => s === sub),
        1,
      )

      if (this.subscribers.length === 0) {
        this.unsubscriber?.()
        this.options.stop?.()
      }
    }
  }
}

// Stream

export type StreamPayload<T> = {
  updated: T[]
  removed: T[]
}

export class Stream<T> {
  private manager: SubscriberManager<StreamPayload<T>>

  constructor(private options: SubscriberManagerOptions = {}) {
    this.manager = new SubscriberManager(options)
  }

  update(updated: T[]) {
    if (updated.length > 0) {
      this.manager.notify({updated, removed: []})
    }
  }

  remove(removed: T[]) {
    if (removed.length > 0) {
      this.manager.notify({removed, updated: []})
    }
  }

  subscribe = (sub: (payload: StreamPayload<T>) => void) => {
    sub({updated: [], removed: []})

    return this.manager.subscribe(sub)
  }
}

// Collection

export type CollectionOptions<T> = SubscriberManagerOptions & {
  name: string
  getKey: (item: T) => string
  load?: (key: string, ...args: any[]) => unknown
  autoStart?: boolean
}

export class Collection<T> {
  private itemsByKey = new Map<string, T>()
  private pendingLoads = new Map<string, Promise<Maybe<T>>>()
  private loadAttempts = new Map<string, number>()
  private unsubscriber: Unsubscriber | undefined

  stream: Stream<T>
  map$: Readable<Map<string, T>>
  all$: Readable<T[]>

  constructor(private options: CollectionOptions<T>) {
    this.stream = new Stream(options)
    this.map$ = derived(this.stream, () => this.itemsByKey)
    this.all$ = derived(this.stream, () => Array.from(this.itemsByKey.values()))

    if (options.autoStart !== false) {
      this.start()
    }
  }

  assertActive = () => {
    if (!this.unsubscriber) {
      throw new Error(`Collection ${this.options.name} must be started before it can be accessed`)
    }
  }

  start = () => {
    if (this.unsubscriber) {
      throw new Error(`Collection ${this.options.name} started multiple times`)
    }

    this.unsubscriber = this.stream.subscribe(payload => {
      for (const item of payload.updated) {
        this.itemsByKey.set(this.options.getKey(item), item)
      }

      for (const item of payload.removed) {
        this.itemsByKey.delete(this.options.getKey(item))
      }
    })

    return this.stop
  }

  stop = () => {
    this.unsubscriber?.()
    this.unsubscriber = undefined
  }

  load = async (key: string, ...args: any[]) => {
    this.assertActive()

    if (!this.options.load) {
      throw new Error("load was not provided")
    }

    const stale = this.one(key)
    const freshness = getFreshness(this.options.name, key)

    // If we have an item, reload if it's stale
    if (stale && freshness > now() - 3600) {
      return stale
    }

    // If we already are loading, await and return
    const pending = this.pendingLoads.get(key)

    if (pending) {
      return pending
    }

    const attempt = this.loadAttempts.get(key) || 0

    // Use exponential backoff to throttle attempts
    if (freshness > now() - Math.pow(2, attempt)) {
      return stale
    }

    this.loadAttempts.set(key, attempt + 1)

    setFreshness(this.options.name, key, now())

    const promise = Promise.resolve(this.options.load(key, ...args)).then(() => this.one(key))

    this.pendingLoads.set(key, promise)

    let item: T | undefined
    try {
      item = await promise
    } catch (e) {
      console.warn(`Failed to load ${this.options.name} item ${key}`, e)
    } finally {
      this.pendingLoads.delete(key)
    }

    if (item) {
      this.loadAttempts.delete(key)
    }

    return item
  }

  map = () => {
    this.assertActive()

    return this.itemsByKey
  }

  all = () => Array.from(this.map().values())

  one = (key: string) => this.map().get(key)

  one$ = (key: string, ...args: any[]) => {
    this.assertActive()
    this.options.load?.(key, ...args)

    let initial = true

    return derived<Stream<T>, Maybe<T>>(this.stream, (payload, set) => {
      if (initial) {
        set(this.one(key))
        initial = false
      }

      for (const item of payload.updated) {
        if (this.options.getKey(item) === key) {
          set(this.one(key))
        }
      }
    })
  }
}

export const makeCollection = <T>(options: CollectionOptions<T>) => new Collection<T>(options)

// Events Collection

export type EventsCollectionOptions = {
  name: string
  filters: Filter[]
  repository: Repository
  includeDeleted?: boolean
}

export const makeEventsCollection = ({
  name,
  filters,
  repository,
  includeDeleted,
}: EventsCollectionOptions) => {
  const getKey = (event: TrustedEvent) => event.id

  const start = () =>
    on(repository, "update", ({added, removed}: RepositoryUpdate) => {
      collection.stream.update(added.filter(e => matchFilters(filters, e)))

      if (!includeDeleted) {
        collection.stream.remove(
          Array.from(removed)
            .map(id => repository.getEvent(id))
            .filter(event => event && matchFilters(filters, event)) as TrustedEvent[],
        )
      }
    })

  const collection = new Collection({name, getKey, start})

  return collection
}

// Mapped Collection

export type MappedCollectionOptions<T> = {
  name: string
  filters: Filter[]
  repository: Repository
  includeDeleted?: boolean
  getKey: (item: T) => string
  eventToItem: (event: TrustedEvent) => MaybeAsync<Maybe<T>>
  load: (key: string, ...args: any[]) => Promise<TrustedEvent[]>
}

export const makeMappedCollection = <T>({
  name,
  filters,
  repository,
  includeDeleted,
  getKey,
  eventToItem,
  ...options
}: MappedCollectionOptions<T>) => {
  const deferred = new Map<string, Promise<Maybe<T>>>()
  const eventIdByKey = new Map<string, string>()
  const keysByEventId = new Map<string, string>()

  const addEvent = async (event: TrustedEvent): Promise<Maybe<T>> => {
    const promise = deferred.get(event.id)

    if (promise) {
      return promise
    }

    const key = keysByEventId.get(event.id)

    if (key) {
      const item = collection.one(key)

      if (item) {
        return item
      }
    }

    const itemOrPromise = eventToItem(event)

    if (itemOrPromise instanceof Promise) {
      deferred.set(event.id, itemOrPromise)
    }

    const item = await itemOrPromise

    if (item) {
      const key = getKey(item)

      keysByEventId.set(event.id, key)
      eventIdByKey.set(key, event.id)

      collection.stream.update([item])
    }

    deferred.delete(event.id)

    return item
  }

  const start = () => {
    for (const event of repository.query(filters, {includeDeleted})) {
      addEvent(event)
    }

    return on(repository, "update", ({added, removed}: RepositoryUpdate) => {
      for (const event of added) {
        if (matchFilters(filters, event)) {
          addEvent(event)
        }
      }

      if (!includeDeleted) {
        collection.stream.remove(
          Array.from(removed)
            .flatMap(id => keysByEventId.get(id) || [])
            .map(collection.one)
            .filter(isDefined),
        )
      }
    })
  }

  const load = async (key: string, ...args: any[]) => {
    for (const event of await options.load(key, ...args)) {
      repository.publish(event)
    }
  }

  const collection = new Collection({name, getKey, start, load})

  return collection
}
