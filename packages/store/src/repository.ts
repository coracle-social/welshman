import {readable, Readable} from "svelte/store"
import {on, now, mapPop, Maybe, MaybeAsync, call, sortBy, first} from "@welshman/lib"
import {
  matchFilters,
  getIdFilters,
  Filter,
  TrustedEvent,
  sortEventsAsc,
  sortEventsDesc,
  getIdOrAddress,
} from "@welshman/util"
import {Repository, RepositoryUpdate, Tracker} from "@welshman/net"
import {deriveDeduplicated} from "./misc.js"

// Events by id

export type EventsById = Map<string, TrustedEvent>

export type EventsByIdOptions = {
  filters: Filter[]
  repository: Repository
  includeDeleted?: boolean
}

export const getEventsById = ({filters, repository, includeDeleted}: EventsByIdOptions) => {
  const eventsById = new Map<string, TrustedEvent>()

  for (const event of repository.query(filters, {includeDeleted})) {
    eventsById.set(event.id, event)
  }

  return eventsById
}

export const deriveEventsById = ({filters, repository, includeDeleted}: EventsByIdOptions) =>
  readable<EventsById>(new Map(), set => {
    const eventsById = getEventsById({filters, repository, includeDeleted})

    set(eventsById)

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

export const deriveArray = <T>(itemsByIdStore: Readable<Map<string, T>>) =>
  deriveDeduplicated(itemsByIdStore, itemsById => Array.from(itemsById.values()))

export const deriveEventsAsc = (eventsByIdStore: Readable<EventsById>) =>
  deriveDeduplicated(eventsByIdStore, eventsById => sortEventsAsc(eventsById.values()))

export const deriveEventsDesc = (eventsByIdStore: Readable<EventsById>) =>
  deriveDeduplicated(eventsByIdStore, eventsById => sortEventsDesc(eventsById.values()))

export const deriveEvents = (options: EventsByIdOptions) => deriveArray(deriveEventsById(options))

export type EventOptions = {
  repository: Repository
  includeDeleted?: boolean
  onDerive?: (filters: Filter[], ...args: any[]) => void
}

export const makeDeriveEvent = ({repository, includeDeleted = false, onDerive}: EventOptions) => {
  return (idOrAddress: string, ...args: any[]) => {
    const filters = getIdFilters([idOrAddress])

    onDerive?.(filters, ...args)

    return readable<Maybe<TrustedEvent>>(undefined, set => {
      let event = first(repository.query(filters, {includeDeleted}))

      set(event)

      return on(repository, "update", ({added, removed}: RepositoryUpdate) => {
        if (!includeDeleted) {
          for (const id of removed) {
            if (event?.id === id) {
              set(undefined)
            }
          }
        }

        for (const newEvent of added) {
          if (matchFilters(filters, newEvent)) {
            event = newEvent
            set(event)
          }
        }
      })
    })
  }
}

// Events by id by url

export type EventsByIdByUrl = Map<string, EventsById>

export type EventsByIdByUrlOptions = EventsByIdOptions & {
  tracker: Tracker
}

export const getEventsByIdByUrl = ({
  filters,
  tracker,
  repository,
  includeDeleted,
}: EventsByIdByUrlOptions) => {
  const eventsByIdByUrl: EventsByIdByUrl = new Map()

  for (const event of repository.query(filters, {includeDeleted})) {
    for (const url of tracker.getRelays(event.id)) {
      let eventsById = eventsByIdByUrl.get(url)
      if (!eventsById) {
        eventsById = new Map()
        eventsByIdByUrl.set(url, eventsById)
      }

      eventsById.set(event.id, event)
    }
  }

  return eventsByIdByUrl
}

export const deriveEventsByIdByUrl = ({
  filters,
  tracker,
  repository,
  includeDeleted,
}: EventsByIdByUrlOptions) =>
  readable<EventsByIdByUrl>(new Map(), set => {
    const eventsByIdByUrl = getEventsByIdByUrl({filters, tracker, repository, includeDeleted})

    const addEvent = (url: string, event: TrustedEvent) => {
      if (!matchFilters(filters, event)) return false

      const eventsById = eventsByIdByUrl.get(url)

      if (eventsById?.has(event.id)) return false

      // Create a new map so we can detect which key changed
      const newEventsById = new Map(eventsById)

      newEventsById.set(event.id, event)
      eventsByIdByUrl.set(url, newEventsById)

      return true
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

    set(eventsByIdByUrl)

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

export type EventsByIdForUrlOptions = EventsByIdOptions & {
  url: string
  tracker: Tracker
}

export const getEventsByIdForUrl = ({
  url,
  filters,
  tracker,
  repository,
  includeDeleted,
}: EventsByIdForUrlOptions) => {
  const initialIds = Array.from(tracker.getIds(url))
  const initialFilters = filters.map(filter => ({ids: initialIds, ...filter}))
  const eventsById: EventsById = new Map()

  for (const event of repository.query(initialFilters, {includeDeleted})) {
    eventsById.set(event.id, event)
  }

  return eventsById
}

export const deriveEventsByIdForUrl = ({
  url,
  filters,
  tracker,
  repository,
  includeDeleted,
}: EventsByIdForUrlOptions) => {
  let eventsById = getEventsByIdForUrl({url, filters, tracker, repository, includeDeleted})

  return readable(eventsById, set => {
    const reset = () => {
      eventsById = getEventsByIdForUrl({url, filters, tracker, repository, includeDeleted})
      set(eventsById)
    }

    reset()

    const unsubscribers = [
      on(repository, "update", ({added, removed}: RepositoryUpdate) => {
        let dirty = false

        for (const event of added) {
          if (tracker.hasRelay(event.id, url) && matchFilters(filters, event)) {
            eventsById.set(event.id, event)
            dirty = true
          }
        }

        for (const id of removed) {
          if (eventsById.has(id)) {
            eventsById.delete(id)
            dirty = true
          }
        }

        if (dirty) {
          set(eventsById)
        }
      }),
      on(tracker, "add", (id: string, trackedUrl: string) => {
        if (trackedUrl === url) {
          const event = repository.getEvent(id)

          if (event && tracker.hasRelay(id, trackedUrl) && matchFilters(filters, event)) {
            eventsById.set(id, event)
            set(eventsById)
          }
        }
      }),
      on(tracker, "remove", (id: string, trackedUrl: string) => {
        if (trackedUrl === url && eventsById.has(id)) {
          eventsById.delete(id)
          set(eventsById)
        }
      }),
      on(tracker, "load", reset),
      on(tracker, "clear", reset),
    ]

    return () => unsubscribers.forEach(call)
  })
}

// Items by key

export type ItemsByKey<T> = Map<string, T>

export type EventToItem<T> = (event: TrustedEvent) => MaybeAsync<Maybe<T>>

export type GetItem<T> = (key: string, ...args: any[]) => Maybe<T>

export type ItemsByKeyOptions<T> = {
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
}: ItemsByKeyOptions<T>) => {
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

      try {
        const item = await itemOrPromise

        if (item) {
          const key = getKey(item)

          itemsByKey.set(key, item)
          idsByKey.set(key, event.id)
          keysById.set(event.id, key)

          set(itemsByKey)
        }
      } finally {
        deferred.delete(event.id)
      }
    }

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
        let dirty = false

        for (const id of removed) {
          const key = mapPop(id, keysById)

          if (key) {
            idsByKey.delete(key)
            itemsByKey.delete(key)
            dirty = true
          }
        }

        if (dirty) {
          set(itemsByKey)
        }
      }
    })
  })
}

// Items by key, scoped by relay url

export type ItemsByKeyByUrlOptions<T> = {
  // Compute the composite key for an item as seen on a specific relay, e.g.
  // `${url}'${groupId}` for NIP-29 group metadata or `${url}` for a per-relay
  // replaceable. The url makes otherwise-colliding events (the same d-tag on
  // different relays) distinct entries. Return `undefined` to exclude the item
  // on that relay (e.g. it fails a relay-signed check).
  getKey: (item: T, url: string) => string | undefined
  filters: Filter[]
  repository: Repository
  tracker: Tracker
  eventToItem: EventToItem<T>
  includeDeleted?: boolean
  // A store whose changes (after the first) trigger a full re-evaluation. Use it
  // when `getKey` depends on external state that can settle after the events —
  // e.g. a relay's self pubkey loaded from NIP-11.
  revalidateOn?: Readable<unknown>
}

/**
 * Like `deriveItemsByKey`, but relay-scoped: an event is keyed once per relay
 * it has been seen on (via the tracker), using `getKey(item, url)`. This is the
 * substrate for relay-dependent collections — NIP-29 rooms, relay membership,
 * relay roles — where the same addressable coordinate can exist independently
 * on multiple relays.
 */
export const deriveItemsByKeyByUrl = <T>({
  getKey,
  filters,
  repository,
  tracker,
  eventToItem,
  includeDeleted,
  revalidateOn,
}: ItemsByKeyByUrlOptions<T>) => {
  const deferred = new Set<string>()
  const itemsByKey = new Map<string, T>()
  // Which event currently owns each composite key, so a stale event's removal
  // doesn't clobber the entry a newer replaceable event has taken over.
  const ownerByKey = new Map<string, string>()
  // The composite keys contributed by each event, per relay url, for teardown.
  const keysById = new Map<string, Map<string, string>>()

  return readable(itemsByKey, set => {
    const setKey = (key: string, id: string, url: string, item: T) => {
      itemsByKey.set(key, item)
      ownerByKey.set(key, id)

      let byUrl = keysById.get(id)

      if (!byUrl) {
        byUrl = new Map()
        keysById.set(id, byUrl)
      }

      byUrl.set(url, key)
    }

    const dropKey = (key: string, id: string) => {
      // Only remove if this id still owns the key (guards against a replaceable
      // event having already taken it over).
      if (ownerByKey.get(key) === id) {
        itemsByKey.delete(key)
        ownerByKey.delete(key)

        return true
      }

      return false
    }

    const addEvent = async (event: TrustedEvent, urls: Iterable<string>) => {
      const pending = Array.from(urls).filter(url => keysById.get(event.id)?.get(url) === undefined)

      if (pending.length === 0) return
      if (deferred.has(event.id)) return

      const itemOrPromise = eventToItem(event)

      if (itemOrPromise instanceof Promise) {
        deferred.add(event.id)
      }

      try {
        const item = await itemOrPromise

        if (item) {
          for (const url of pending) {
            const key = getKey(item, url)

            if (key !== undefined) {
              setKey(key, event.id, url, item)
            }
          }

          set(itemsByKey)
        }
      } finally {
        deferred.delete(event.id)
      }
    }

    const removeEvent = (id: string) => {
      const byUrl = mapPop(id, keysById)

      if (!byUrl) return false

      let dirty = false

      for (const key of byUrl.values()) {
        dirty = dropKey(key, id) || dirty
      }

      return dirty
    }

    const removeEventUrl = (id: string, url: string) => {
      const byUrl = keysById.get(id)
      const key = byUrl?.get(url)

      if (!byUrl || key === undefined) return false

      byUrl.delete(url)

      if (byUrl.size === 0) {
        keysById.delete(id)
      }

      return dropKey(key, id)
    }

    const rebuild = () => {
      itemsByKey.clear()
      ownerByKey.clear()
      keysById.clear()

      for (const event of repository.query(filters, {includeDeleted})) {
        addEvent(event, tracker.getRelays(event.id))
      }

      set(itemsByKey)
    }

    rebuild()

    const unsubscribers = [
      on(repository, "update", ({added, removed}: RepositoryUpdate) => {
        for (const event of added) {
          if (matchFilters(filters, event)) {
            addEvent(event, tracker.getRelays(event.id))
          }
        }

        if (!includeDeleted) {
          let dirty = false

          for (const id of removed) {
            dirty = removeEvent(id) || dirty
          }

          if (dirty) set(itemsByKey)
        }
      }),
      on(tracker, "add", (id: string, url: string) => {
        const event = repository.getEvent(id)

        if (event && matchFilters(filters, event)) {
          addEvent(event, [url])
        }
      }),
      on(tracker, "remove", (id: string, url: string) => {
        if (removeEventUrl(id, url)) {
          set(itemsByKey)
        }
      }),
      on(tracker, "clear", () => {
        itemsByKey.clear()
        ownerByKey.clear()
        keysById.clear()

        set(itemsByKey)
      }),
    ]

    // Re-evaluate everything when external key state (e.g. relay self pubkeys)
    // changes. The first emission fires synchronously on subscribe and is the
    // initial state we already built, so skip it.
    if (revalidateOn) {
      let initialized = false

      unsubscribers.push(
        revalidateOn.subscribe(() => {
          if (initialized) {
            rebuild()
          } else {
            initialized = true
          }
        }),
      )
    }

    return () => unsubscribers.forEach(call)
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

export const makeLoadItem = <T>(
  loadItem: LoadItem,
  getItem: GetItem<T>,
  options: MakeLoadItemOptions = {},
) => {
  const timeout = options.timeout || 3600
  const fetched = new Map<string, number>()
  const getFetched = options.getFetched || ((key: string) => fetched.get(key) || 0)
  const setFetched = options.setFetched || ((key: string, ts: number) => fetched.set(key, ts))
  const pending = new Map<string, Promise<Maybe<T>>>()
  const attempts = new Map<string, number>()

  return (key: string, ...args: any[]): Promise<Maybe<T>> => {
    const stale = getItem(key)
    const fetched = getFetched(key)

    // If we have an item, reload if it's relatively recent
    if (stale && fetched > now() - timeout) {
      return Promise.resolve(stale)
    }

    const pendingItem = pending.get(key)

    // If we already are loading, await and return
    if (pendingItem) {
      return Promise.resolve(pendingItem)
    }

    const attempt = attempts.get(key) || 0

    // Use exponential backoff to throttle attempts
    if (fetched > now() - Math.pow(2, attempt)) {
      return Promise.resolve(stale)
    }

    attempts.set(key, attempt + 1)

    setFetched(key, now())

    const promise = loadItem(key, ...args).then(() => getItem(key))

    pending.set(key, promise)

    return call(async () => {
      let item
      try {
        item = await promise
      } catch (e) {
        console.warn(`Failed to load item ${key}`, e)
      } finally {
        pending.delete(key)
      }

      if (item) {
        attempts.delete(key)
      }

      return item
    })
  }
}

// Miscellaneous other stuff

export const deriveIsDeleted = (repository: Repository, event: TrustedEvent) =>
  readable(false, set => {
    const idOrAddress = getIdOrAddress(event)

    set(repository.isDeleted(event))

    return on(repository, "update", ({removed, added}: RepositoryUpdate) => {
      if (removed.has(event.id)) {
        set(true)
      }

      for (const event of added) {
        if (getIdOrAddress(event) === idOrAddress) {
          set(false)
        }
      }
    })
  })
