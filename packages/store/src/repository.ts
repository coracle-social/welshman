import {derived, readable, Readable} from "svelte/store"
import {on, assoc, now, indexBy, mapPop, Maybe, MaybeAsync, call, sortBy, first} from "@welshman/lib"
import {matchFilters, getIdFilters, Filter, TrustedEvent} from "@welshman/util"
import {Repository, RepositoryUpdate, Tracker} from "@welshman/net"
import {deriveDeduplicated} from "./misc.js"

// Events by id

export type EventsById = Map<string, TrustedEvent>

export type DeriveEventsByIdOptions = {
  filters: Filter[]
  repository: Repository
  includeDeleted?: boolean
}

export const deriveEventsById = ({
  filters,
  repository,
  includeDeleted,
}: DeriveEventsByIdOptions) => {
  const eventsById: EventsById = indexBy(e => e.id, repository.query(filters, {includeDeleted}))

  return readable(eventsById, set => {
    return on(repository, "update", ({added, removed}: RepositoryUpdate) => {
      let dirty = false

      for (const event of added) {
        if (matchFilters(filters, event)) {
          dirty = true
          eventsById.set(event.id, event)
        }
      }

      for (const id of removed) {
        if (mapPop(id, eventsById)) {
          dirty = true
        }
      }

      if (dirty) {
        set(eventsById)
      }
    })
  })
}

export const deriveEvents = (eventsByIdStore: Readable<EventsById>) =>
  deriveDeduplicated(eventsByIdStore, eventsById => Array.from(eventsById.values()))

export const deriveEventsAsc = (eventsByIdStore: Readable<EventsById>) =>
  deriveDeduplicated(eventsByIdStore, eventsById => sortBy(e => e.created_at, eventsById.values()))

export const deriveEventsDesc = (eventsByIdStore: Readable<EventsById>) =>
  deriveDeduplicated(eventsByIdStore, eventsById => sortBy(e => -e.created_at, eventsById.values()))

// Events by id by url

export type DeriveEventsByIdForUrlOptions = DeriveEventsByIdOptions & {
  url: string
  tracker: Tracker
}

export const deriveEventsByIdForUrl = ({
  url,
  filters,
  tracker,
  repository,
  includeDeleted,
}: DeriveEventsByIdForUrlOptions) => {
  const eventsById: EventsById = new Map()

  const initialize = () => {
    const initialIds = Array.from(tracker.getIds(url))
    const initialFilters = filters.map(assoc('ids', initialIds))

    for (const event of repository.query(initialFilters, {includeDeleted})) {
      eventsById.set(event.id, event)
    }

    return eventsById
  }

  return readable(initialize(), set => {
    const unsubscribers = [
      on(repository, "update", ({added, removed}: RepositoryUpdate) => {
        let dirty = false

        for (const event of added) {
          if (tracker.hasRelay(event.id, url) && !eventsById.has(event.id)) {
            eventsById.set(event.id, event)
            dirty = true
          }
        }

        for (const id of removed) {
          eventsById.delete(id)
          dirty = true
        }

        if (dirty) {
          set(eventsById)
        }
      }),
      on(tracker, "add", (id: string, url: string) => {
        const event = repository.getEvent(id)

        if (event && tracker.hasRelay(id, url) && !eventsById.has(id)) {
          eventsById.set(id, event)
          set(eventsById)
        }
      }),
      on(tracker, "remove", (id: string, url: string) => {
        if (eventsById.has(id)) {
          eventsById.delete(id)
          set(eventsById)
        }
      }),
      on(tracker, "load", () => {
        eventsById.clear()
        initialize()

        set(eventsById)
      }),
      on(tracker, "clear", () => {
        eventsById.clear()

        set(eventsById)
      }),
    ]

    return () => unsubscribers.forEach(call)
  })
}

// Items by key

export type ItemsByKey<T> = Map<string, T>

export type EventToItem<T> = (event: TrustedEvent) => MaybeAsync<Maybe<T>>

export type GetItem<T> = (key: string, ...args: any[]) => Maybe<T>

export type DeriveItemsByKeyOptions<T> = {
  getKey: (item: T) => string
  filters: Filter[]
  repository: Repository
  eventToItem: EventToItem<T>
  includeDeleted?: boolean
}

export const deriveItemsByKey = <T>({
  getKey,
  filters,
  repository,
  eventToItem,
  includeDeleted,
}: DeriveItemsByKeyOptions<T>) => {
  const deferred = new Map<string, Promise<Maybe<T>>>()
  const itemsByKey = new Map<string, T>()
  const idsByKey = new Map<string, string>()
  const keysById = new Map<string, string>()

  return readable(itemsByKey, set => {
    const addEvent = async (event: TrustedEvent) => {
      if (deferred.has(event.id)) return
      if (keysById.has(event.id)) return

      const itemOrPromise = eventToItem(event)

      if (itemOrPromise instanceof Promise) {
        deferred.set(event.id, itemOrPromise)
      }

      const item = await itemOrPromise

      deferred.delete(event.id)

      if (item) {
        const key = getKey(item)

        itemsByKey.set(key, item)
        idsByKey.set(key, event.id)
        keysById.set(event.id, key)

        set(itemsByKey)
      }
    }

    for (const event of repository.query(filters, {includeDeleted})) {
      addEvent(event)
    }

    return on(repository, "update", ({added, removed}: RepositoryUpdate) => {
      let dirty = false

      for (const event of added) {
        if (matchFilters(filters, event)) {
          addEvent(event)
          dirty = true
        }
      }

      if (!includeDeleted) {
        for (const id of removed) {
          const key = mapPop(id, keysById)

          if (key) {
            idsByKey.delete(key)
            itemsByKey.delete(key)
            dirty = true
          }
        }
      }

      if (dirty) {
        set(itemsByKey)
      }
    })
  })
}

export const deriveItems = <T>(itemsByKeyStore: Readable<ItemsByKey<T>>) =>
  deriveDeduplicated(itemsByKeyStore, itemsByKey => Array.from(itemsByKey.values()))

export const deriveItemsSorted = <T>(sortFn: (item: T) => number, itemsStore: Readable<T[]>) =>
  deriveDeduplicated(itemsStore, items => sortBy(sortFn, items))

export const makeDeriveItem = <T>(
  itemsByKeyStore: Readable<ItemsByKey<T>>,
  onDerive?: (key: string, ...args: any[]) => void,
) => {
  return (key?: string, ...args: any[]) => {
    if (!key) return readable(undefined)

    onDerive?.(key, ...args)

    return deriveDeduplicated(itemsByKeyStore, itemsByKey => itemsByKey.get(key))
  }
}

// Item loaders

export type LoadItem = (key: string, ...args: any[]) => Promise<unknown>

export const makeForceLoadItem = <T>(loadItem: LoadItem, getItem: GetItem<T>) => {
  return (key: string, ...args: any[]) => loadItem(key, ...args).then(() => getItem(key))
}

export type MakeLoadItemOptions = {
  getFetched?: (key: string) => number
  setFetched?: (key: string, ts: number) => void
  timeout?: number
}

export const makeLoadItem = <T>(loadItem: LoadItem, getItem: GetItem<T>, options: MakeLoadItemOptions = {}) => {
  const timeout = options.timeout || 3600
  const fetched = new Map<string, number>()
  const getFetched = options.getFetched || ((key: string) => fetched.get(key) || 0)
  const setFetched = options.setFetched || ((key: string, ts: number) => fetched.set(key, ts))
  const pending = new Map<string, Promise<Maybe<T>>>()
  const attempts = new Map<string, number>()

  return async (key: string, ...args: any[]): Promise<Maybe<T>> => {
    const stale = getItem(key)
    const fetched = getFetched(key)

    // If we have an item, reload if it's stale
    if (stale && fetched > now() - timeout) {
      return stale
    }

    const pendingItem = pending.get(key)

    // If we already are loading, await and return
    if (pendingItem) {
      return pendingItem
    }

    const attempt = attempts.get(key) || 0

    // Use exponential backoff to throttle attempts
    if (fetched > now() - Math.pow(2, attempt)) {
      return stale
    }

    attempts.set(key, attempt + 1)

    setFetched(key, now())

    const promise = loadItem(key, ...args).then(() => getItem(key))

    pending.set(key, promise)

    let item
    try {
      item = await promise
    } catch (e) {
      console.warn(`Failed to load ${name} item ${key}`, e)
    } finally {
      pending.delete(key)
    }

    if (item) {
      attempts.delete(key)
    }

    return item
  }
}

// Miscellaneous other stuff

export const deriveEvent = (repository: Repository, idOrAddress: string) =>
  derived(
    deriveEventsById({
      repository,
      filters: getIdFilters([idOrAddress]),
      includeDeleted: true,
    }),
    $m => first($m.values()),
  )

export const deriveIsDeleted = (repository: Repository, event: TrustedEvent) =>
  readable(repository.isDeleted(event), set => {
    const unsubscribe = on(repository, "update", ({removed}: RepositoryUpdate) => {
      if (removed.has(event.id)) {
        set(true)
        unsubscribe()
      }
    })

    return unsubscribe
  })
