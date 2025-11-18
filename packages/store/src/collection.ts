import {Unsubscriber, Subscriber, Readable, derived} from "svelte/store"
import {Maybe, MaybeAsync, once, isDefined, always, now, indexBy, on} from "@welshman/lib"
import {Repository, RepositoryUpdate} from "@welshman/net"
import {Filter, TrustedEvent, matchFilters} from "@welshman/util"
import {getFreshness, setFreshness} from "./freshness.js"
import {deriveIfChanged} from "./memoize.js"

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

// Notifier

export enum NotifierPayloadType {
  Put = "put",
  Pop = "pop",
}

export type ItemHandler<T> = (item: T) => void

export class NotifierPayload<T> {
  constructor(
    readonly type: NotifierPayloadType,
    readonly items: T[],
  ) {}

  static put<T>(items: T[]) {
    return new NotifierPayload(NotifierPayloadType.Put, items)
  }

  static pop<T>(items: T[]) {
    return new NotifierPayload(NotifierPayloadType.Pop, items)
  }

  handlePut(f: ItemHandler<T>) {
    if (this.type === NotifierPayloadType.Put) {
      for (const item of this.items) {
        f(item)
      }
    }
  }

  handlePop(f: ItemHandler<T>) {
    if (this.type === NotifierPayloadType.Pop) {
      for (const item of this.items) {
        f(item)
      }
    }
  }
}

export type NotifierHandler<T> = (payload: NotifierPayload<T>) => void

export class Notifier<T> {
  private manager: SubscriberManager<NotifierPayload<T>>

  constructor(private options: SubscriberManagerOptions = {}) {
    this.manager = new SubscriberManager(options)
  }

  put(items: T[]) {
    if (items.length > 0) {
      this.manager.notify(NotifierPayload.put(items))
    }
  }

  pop(items: T[]) {
    if (items.length > 0) {
      this.manager.notify(NotifierPayload.pop(items))
    }
  }

  subscribe = (sub: NotifierHandler<T>) => {
    return this.manager.subscribe(sub)
  }
}

// Source

export type Source<T> = () => Map<string, T>

// Loader

export type Loader<T> = (key: string, ...args: any[]) => Promise<Maybe<T>>

// Collection

export type CollectionOptions<T> = {
  name: string
  source: Source<T>
  notifier: Notifier<T>
  getKey: (item: T) => string
  load?: Loader<T>
}

export class Collection<T> {
  private index: Maybe<Map<string, T>>
  private manager: SubscriberManager<NotifierPayload<T>>
  private pendingLoads = new Map<string, Promise<Maybe<T>>>()
  private loadAttempts = new Map<string, number>()

  index$: Readable<Map<string, T>>
  items$: Readable<T[]>

  constructor(private options: CollectionOptions<T>) {
    this.manager = new SubscriberManager({
      start: this.start,
      stop: this.stop,
    })

    this.index$ = derived(this.manager, this.getIndex)
    this.items$ = derived(this.manager, this.getItems)
  }

  private start = () => {
    this.index = this.getIndex()

    return this.options.notifier.subscribe(payload => {
      payload.handlePut(item => {
        this.index?.set(this.options.getKey(item), item)
      })

      payload.handlePop(item => {
        this.index?.delete(this.options.getKey(item))
      })

      this.manager.notify(payload)
    })
  }

  private stop = () => {
    this.index?.clear()
  }

  subscribe = (sub: NotifierHandler<T>) => {
    return this.manager.subscribe(sub)
  }

  load: Loader<T> = async (key: string, ...args: any[]) => {
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
    if (this.pendingLoads.has(key)) {
      return this.pendingLoads.get(key)!
    }

    const attempt = this.loadAttempts.get(key) || 0

    // Use exponential backoff to throttle attempts
    if (freshness > now() - Math.pow(2, attempt)) {
      return stale
    }

    this.loadAttempts.set(key, attempt + 1)

    setFreshness(this.options.name, key, now())

    const promise = this.options.load(key, ...args)

    this.pendingLoads.set(key, promise)

    let item: Maybe<T>
    try {
      item = await promise
    } catch (e) {
      console.warn(`Failed to load ${this.options.name} item ${key}`, e)
    } finally {
      this.pendingLoads.delete(key)
    }

    if (item) {
      this.options.notifier.put([item])
      this.loadAttempts.delete(key)
    }

    return item
  }

  getIndex = () => this.index || this.options.source()

  getItems = () => Array.from(this.getIndex().values())

  one = (key: string) => this.getIndex().get(key)

  one$ = (key: string, ...args: any[]) => {
    this.options.load?.(key, ...args)

    return deriveIfChanged(this.manager, () => this.one(key))
  }
}

// Loader Collection

export type LoaderCollectionOptions<T> = {
  name: string
  getKey: (item: T) => string
  load: Loader<T>
}

export const makeLoaderCollection = <T>({name, getKey, load}: LoaderCollectionOptions<T>) => {
  const notifier = new Notifier<T>({})
  const source = once(() => new Map<string, T>())
  const collection = new Collection<T>({name, getKey, source, notifier, load})

  return collection
}

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

  const source = () => indexBy(e => e.id, repository.query(filters, {includeDeleted}))

  const notifier = new Notifier<TrustedEvent>({
    start: () =>
      on(repository, "update", ({added, removed}: RepositoryUpdate) => {
        notifier.put(added)

        if (!includeDeleted) {
          const modifiedFilters = filters.map(f => ({...f, ids: Array.from(removed)}))
          const deletedEvents = repository.query(modifiedFilters, {includeDeleted: true})

          notifier.pop(deletedEvents)
        }
      }),
  })

  return new Collection({name, getKey, source, notifier})
}

// Mapped Collection

export type MappedCollectionOptions<T> = {
  name: string
  filters: Filter[]
  repository: Repository
  includeDeleted?: boolean
  getKey: (item: T) => string
  eventToItem: (event: TrustedEvent) => MaybeAsync<Maybe<T>>
  load: Loader<TrustedEvent>
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
  const source = always(new Map())
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

      notifier.put([item])
    }

    deferred.delete(event.id)

    return item
  }

  const notifier = new Notifier<T>({
    start: () => {
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
          notifier.pop(
            Array.from(removed)
              .flatMap(id => keysByEventId.get(id) || [])
              .map(collection.one)
              .filter(isDefined),
          )
        }
      })
    },
  })

  const load = async (key: string, ...args: any[]) => {
    const event = await options.load(key, ...args)

    if (event) {
      repository.publish(event)

      return addEvent(event)
    }
  }

  const collection = new Collection({name, getKey, source, notifier, load})

  return collection
}
