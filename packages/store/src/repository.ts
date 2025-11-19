import {derived, readable, Readable} from "svelte/store"
import {
  on,
  indexBy,
  mapPop,
  Maybe,
  call,
  sortBy,
  identity,
  ensurePlural,
  removeUndefined,
  batch,
  partition,
  first,
} from "@welshman/lib"
import {matchFilters, getIdAndAddress, getIdFilters, Filter, TrustedEvent} from "@welshman/util"
import {Repository, RepositoryUpdate, Tracker} from "@welshman/net"
import {deriveDeduplicated} from './memoize.js'

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

export const deriveEventsAsc = (eventsStore: Readable<TrustedEvent[]>) =>
  deriveDeduplicated(eventsStore, events => sortBy(e => e.created_at, events))

export const deriveEventsDesc = (eventsStore: Readable<TrustedEvent[]>) =>
  deriveDeduplicated(eventsStore, events => sortBy(e => -e.created_at, events))

// Events by id by url

export type EventsByIdByUrl = Map<string, EventsById>

export type DeriveEventsByIdByUrlOptions = DeriveEventsByIdOptions & {
  tracker: Tracker
}

export const deriveEventsByIdByUrl = ({
  filters,
  tracker,
  repository,
  includeDeleted,
}: DeriveEventsByIdByUrlOptions) => {
  const eventsByIdByUrl: EventsByIdByUrl = new Map()

  const addEvent = (url: string, event: TrustedEvent) => {
    const eventsById = eventsByIdByUrl.get(url)

    if (!eventsById?.has(event.id)) {
      // Create a new map so we can detect which key changed
      const newEventsById = new Map(eventsById)

      newEventsById.set(event.id, event)
      eventsByIdByUrl.set(url, newEventsById)

      return true
    }

    return false
  }

  const removeEvent = (url: string, id: string) => {
    const eventsById = eventsByIdByUrl.get(url)

    if (eventsById?.has(id)) {
      eventsById.delete(id)

      if (eventsById.size === 0) {
        eventsByIdByUrl.delete(url)
      } else {
        // Create a new map so we can detect which key changed
        eventsByIdByUrl.set(url, new Map(eventsById))
      }

      return true
    }

    return false
  }

  for (const event of repository.query(filters, {includeDeleted})) {
    for (const url of tracker.getRelays(event.id)) {
      addEvent(url, event)
    }
  }

  return readable(eventsByIdByUrl, set => {
    const unsubscribers = [
      on(repository, "update", ({added, removed}: RepositoryUpdate) => {
        let dirty = false

        for (const event of added) {
          for (const url of tracker.getRelays(event.id)) {
            dirty = dirty || addEvent(url, event)
          }
        }

        for (const id of removed) {
          for (const url of tracker.getRelays(id)) {
            dirty = dirty || removeEvent(url, id)
          }
        }

        if (dirty) {
          set(eventsByIdByUrl)
        }
      }),
      on(tracker, "add", (id: string, url: string) => {
        const event = repository.getEvent(id)

        if (event && addEvent(url, event)) {
          set(eventsByIdByUrl)
        }
      }),
      on(tracker, "remove", (id: string, url: string) => {
        if (removeEvent(url, id)) {
          set(eventsByIdByUrl)
        }
      }),
      on(tracker, "load", () => {
        eventsByIdByUrl.clear()

        for (const event of repository.query(filters, {includeDeleted})) {
          for (const url of tracker.getRelays(event.id)) {
            addEvent(url, event)
          }
        }

        set(eventsByIdByUrl)
      }),
      on(tracker, "clear", () => {
        eventsByIdByUrl.clear()

        set(eventsByIdByUrl)
      }),
    ]

    return () => unsubscribers.forEach(call)
  })
}

export const deriveEventsByIdForUrl = (url: string, eventsByIdByUrlStore: Readable<EventsByIdByUrl>) =>
  deriveDeduplicated(eventsByIdByUrlStore, eventsByIdByUrl => eventsByIdByUrl.get(url))


// Items by key

export type ItemsByKey<T> = Map<string, T>

export type EventToItem<T> = (event: TrustedEvent) => T

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
    const unsubscribe = on(repository, 'update', ({removed}: RepositoryUpdate) => {
      if (removed.has(event.id)) {
        set(true)
        unsubscribe()
      }
    })

    return unsubscribe
  })
