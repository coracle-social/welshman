import {derived, readable, Readable} from "svelte/store"
import {
  on,
  gt,
  now,
  noop,
  mapPop,
  LRUCache,
  Maybe,
  MaybeAsync,
  call,
  sortBy,
  first,
} from "@welshman/lib"
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
import {deriveDeduplicated, projection, projectFrom} from "./misc.js"
import type {Projection} from "./misc.js"

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

export const deriveEventsById = (options: EventsByIdOptions): Projection<EventsById> => {
  const {filters, repository, includeDeleted} = options

  const store = readable<EventsById>(new Map(), set => {
    const eventsById = getEventsById(options)

    set(eventsById)

    return on(repository, "update", ({added, removed}: RepositoryUpdate) => {
      let dirty = false

      for (const event of added) {
        if (matchFilters(filters, event)) {
          dirty = true
          eventsById.set(event.id, event)
        }
      }

      if (!includeDeleted) {
        for (const id of removed) {
          if (mapPop(id, eventsById)) {
            dirty = true
          }
        }
      }

      if (dirty) {
        set(eventsById)
      }
    })
  })

  return projection(store, () => getEventsById(options))
}

export const deriveArray = <T>(itemsById: Projection<Map<string, T>>) =>
  projectFrom(itemsById, $itemsById => Array.from($itemsById.values()))

export const deriveEventsAsc = (eventsById: Projection<EventsById>) =>
  projectFrom(eventsById, $eventsById => sortEventsAsc($eventsById.values()))

export const deriveEventsDesc = (eventsById: Projection<EventsById>) =>
  projectFrom(eventsById, $eventsById => sortEventsDesc($eventsById.values()))

export const deriveEvents = (options: EventsByIdOptions) => deriveArray(deriveEventsById(options))

export type EventOptions = {
  repository: Repository
  includeDeleted?: boolean
  onDerive?: (filters: Filter[], ...args: any[]) => void
}

export const makeDeriveEvent = ({repository, includeDeleted = false, onDerive}: EventOptions) => {
  return (idOrAddress: string, ...args: any[]): Projection<Maybe<TrustedEvent>> => {
    const filters = getIdFilters([idOrAddress])

    onDerive?.(filters, ...args)

    const store = readable<Maybe<TrustedEvent>>(undefined, set => {
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

    return projection(store, () => first(repository.query(filters, {includeDeleted})))
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

export const deriveEventsByIdByUrl = (
  options: EventsByIdByUrlOptions,
): Projection<EventsByIdByUrl> => {
  const {filters, tracker, repository, includeDeleted} = options

  const store = readable<EventsByIdByUrl>(new Map(), set => {
    const eventsByIdByUrl = getEventsByIdByUrl(options)

    const addEvent = (url: string, event: TrustedEvent) => {
      if (!matchFilters(filters, event)) return false

      const eventsById = eventsByIdByUrl.get(url)

      // The repository swaps a changed copy of a held event in under the same id.
      if (eventsById?.get(event.id) === event) return false

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
            dirty = addEvent(url, event) || dirty
          }
        }

        if (!includeDeleted) {
          for (const id of removed) {
            for (const url of tracker.getRelays(id)) {
              dirty = removeEvent(url, id) || dirty
            }
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

  return projection(store, () => getEventsByIdByUrl(options))
}

export type EventsByIdForUrlOptions = EventsByIdOptions & {
  url: string
  tracker: Tracker
}

/**
 * The events one relay has been seen to hold, narrowed by the filters. The filters choose the
 * index and the tracker answers provenance per event, so the cost tracks what the caller asked
 * for, and a limit counts only events on the relay.
 */
export const getEventsByIdForUrl = ({
  url,
  filters,
  tracker,
  repository,
  includeDeleted,
}: EventsByIdForUrlOptions) => {
  const eventsById: EventsById = new Map()

  const where = (event: TrustedEvent) => tracker.hasRelay(event.id, url)

  for (const event of repository.query(filters, {includeDeleted, where})) {
    eventsById.set(event.id, event)
  }

  return eventsById
}

export const deriveEventsByIdForUrl = (
  options: EventsByIdForUrlOptions,
): Projection<EventsById> => {
  const {url, filters, tracker, repository, includeDeleted} = options

  let eventsById = getEventsByIdForUrl(options)

  const store = readable(eventsById, set => {
    const reset = () => {
      eventsById = getEventsByIdForUrl(options)
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

        if (!includeDeleted) {
          for (const id of removed) {
            if (eventsById.has(id)) {
              eventsById.delete(id)
              dirty = true
            }
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

  return projection(store, () => getEventsByIdForUrl(options))
}

// Items by key

export type ItemsByKey<T> = Map<string, T>

export type EventToItem<T> = (event: TrustedEvent) => MaybeAsync<Maybe<T>>

export type GetItem<T> = (key: string, ...args: any[]) => MaybeAsync<Maybe<T>>

/**
 * A keyed collection of items built from events: a `Projection` over an index, plus a
 * `read` that waits out the parses the index has outstanding.
 *
 * `eventToItem` returns a promise for any kind that decrypts, so the item an event
 * builds is committed after the event was read rather than with it. `read` is how a
 * caller gets an item the collection has seen the event for but not yet parsed.
 */
export type ItemCollection<T> = Projection<ItemsByKey<T>> & {
  read: (key: string) => MaybeAsync<Maybe<T>>
}

const asCollection = <T>(
  store: Readable<ItemsByKey<T>>,
  pending: Map<string, Promise<unknown>>,
): ItemCollection<T> => {
  const self = projection(store)

  // Subscribing queues the parses, so a key the index lacks is read, drained, and read again
  const read = (key: string) =>
    self.get().get(key) ?? Promise.all(pending.values()).then(() => self.get().get(key))

  return {...self, read}
}

const onParseError = (error: unknown) =>
  console.warn("Failed to build an item from an event", error)

/**
 * Build the item for `event` and hand it to `commit`. A synchronous `eventToItem` commits
 * before this returns, so items are in place before an initial subscription does, and its
 * result is returned. An async one is held in `pending` until committed, so awaiting it
 * means the item is in the index. Deleting the event's entry from `pending` cancels the
 * commit, so an event removed mid-parse stays removed.
 */
const buildItem = <T>(
  event: TrustedEvent,
  eventToItem: EventToItem<T>,
  pending: Map<string, Promise<unknown>>,
  commit: (item: Maybe<T>) => boolean | void,
) => {
  let changed = false

  try {
    const itemOrPromise = eventToItem(event)

    if (itemOrPromise instanceof Promise) {
      const isPending = () => pending.get(event.id) === parse

      const parse: Promise<unknown> = itemOrPromise
        .then(item => {
          if (isPending()) commit(item)
        })
        .catch(onParseError)
        .finally(() => {
          if (isPending()) pending.delete(event.id)
        })

      pending.set(event.id, parse)
    } else {
      changed = Boolean(commit(itemOrPromise))
    }
  } catch (error) {
    onParseError(error)
  }

  return changed
}

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
}: ItemsByKeyOptions<T>): ItemCollection<T> => {
  const pending = new Map<string, Promise<unknown>>()
  const itemsByKey = new Map<string, T>()
  const idsByKey = new Map<string, string>()
  const keysById = new Map<string, string>()

  const store = readable(itemsByKey, set => {
    const addEvent = (event: TrustedEvent) => {
      if (pending.has(event.id)) return
      if (keysById.has(event.id)) return

      const commit = (item: Maybe<T>) => {
        if (item) {
          const key = getKey(item)

          itemsByKey.set(key, item)
          idsByKey.set(key, event.id)
          keysById.set(event.id, key)

          set(itemsByKey)
        }
      }

      buildItem(event, eventToItem, pending, commit)
    }

    const removeEvent = (id: string) => {
      const key = mapPop(id, keysById)

      pending.delete(id)

      const owns = key !== undefined && idsByKey.get(key) === id

      // Only remove if this id still owns the key — replacing a replaceable event
      // reports the old id as removed in the same update that adds the new one,
      // and the newer event has already taken the key over.
      if (owns) {
        idsByKey.delete(key)
        itemsByKey.delete(key)
      }

      return owns
    }

    // The index outlives a subscription, so a subscribe drops what left the repository meanwhile
    const events = repository.query(filters, {includeDeleted})
    const ids = new Set(events.map(event => event.id))
    let pruned = false

    for (const id of Array.from(keysById.keys())) {
      if (!ids.has(id)) {
        pruned = removeEvent(id) || pruned
      }
    }

    if (pruned) {
      set(itemsByKey)
    }

    for (const event of events) {
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
          dirty = removeEvent(id) || dirty
        }

        if (dirty) {
          set(itemsByKey)
        }
      }
    })
  })

  return asCollection(store, pending)
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
}: ItemsByKeyByUrlOptions<T>): ItemCollection<T> => {
  const pending = new Map<string, Promise<unknown>>()
  const itemsByKey = new Map<string, T>()
  // Which event currently owns each composite key, so a stale event's removal
  // doesn't clobber the entry a newer replaceable event has taken over.
  const ownerByKey = new Map<string, string>()
  // The composite keys contributed by each event, per relay url, for teardown.
  const keysById = new Map<string, Map<string, string>>()
  // What each event parsed to, so a rebuild re-keys it without parsing it again.
  const itemsById = new Map<string, T>()

  const store = readable(itemsByKey, set => {
    // Held while a catch-up keys its events, so a rebuild emits once rather than per event
    let holding = false

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

    // Key an event's item on each relay the tracker has it on now and it has no key for yet,
    // so a relay seen while the event was parsing is keyed too.
    const commit = (id: string, item: Maybe<T>) => {
      let keyed = false

      if (item) {
        itemsById.set(id, item)

        for (const url of tracker.getRelays(id)) {
          const key = keysById.get(id)?.has(url) ? undefined : getKey(item, url)

          if (key !== undefined) {
            setKey(key, id, url, item)
            keyed = true
          }
        }

        // An item no url keys leaves the index alone, so it owes no emission
        if (keyed && !holding) set(itemsByKey)
      }

      return keyed
    }

    const addEvent = (event: TrustedEvent) => {
      const parsed = itemsById.get(event.id)
      let keyed = false

      // A rebuild clears the keys and keeps the items, so re-keying needs no parse
      if (parsed) {
        keyed = commit(event.id, parsed)
      } else if (!pending.has(event.id)) {
        keyed = buildItem(event, eventToItem, pending, item => commit(event.id, item))
      }

      return keyed
    }

    const removeEvent = (id: string) => {
      const byUrl = mapPop(id, keysById)

      pending.delete(id)
      itemsById.delete(id)

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

    const catchUp = (cleared = false) => {
      const events = repository.query(filters, {includeDeleted})
      const ids = new Set(events.map(event => event.id))
      let dirty = cleared

      for (const id of Array.from(keysById.keys())) {
        if (!ids.has(id)) {
          dirty = removeEvent(id) || dirty
        }
      }

      holding = true

      for (const event of events) {
        dirty = addEvent(event) || dirty
      }

      holding = false

      if (dirty) set(itemsByKey)
    }

    const clear = () => {
      const dirty = itemsByKey.size > 0

      itemsByKey.clear()
      ownerByKey.clear()
      keysById.clear()

      return dirty
    }

    const rebuild = () => catchUp(clear())

    catchUp()

    const unsubscribers = [
      on(repository, "update", ({added, removed}: RepositoryUpdate) => {
        for (const event of added) {
          if (matchFilters(filters, event)) {
            addEvent(event)
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
          addEvent(event)
        }
      }),
      on(tracker, "remove", (id: string, url: string) => {
        if (removeEventUrl(id, url)) {
          set(itemsByKey)
        }
      }),
      on(tracker, "load", rebuild),
      on(tracker, "clear", () => {
        if (clear()) set(itemsByKey)
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

  return asCollection(store, pending)
}

export const deriveItems = <T>(itemsByKeyStore: Readable<ItemsByKey<T>>) =>
  derived(itemsByKeyStore, itemsByKey => Array.from(itemsByKey.values()))

export const deriveItemsSorted = <T>(sortFn: (item: T) => number, itemsStore: Readable<T[]>) =>
  derived(itemsStore, items => sortBy(sortFn, items))

export const makeDeriveItem = <T>(
  itemsByKeyStore: Readable<ItemsByKey<T>>,
  onDerive?: (key: string, ...args: any[]) => unknown,
) => {
  return (key?: string, ...args: any[]) => {
    if (!key) return readable(undefined)

    // Nothing awaits this, so a failed load has nowhere to go
    Promise.resolve(onDerive?.(key, ...args)).catch(noop)

    return deriveDeduplicated(itemsByKeyStore, itemsByKey => itemsByKey.get(key))
  }
}

// Item loaders

export type LoadItem = (key: string, ...args: any[]) => Promise<unknown>

export const makeForceLoadItem = <T>(loadItem: LoadItem, getItem: GetItem<T>) => {
  return async (key: string, ...args: any[]) => {
    await loadItem(key, ...args)

    return getItem(key)
  }
}

export type MakeLoadItemOptions = {
  getFetched?: (key: string) => number
  setFetched?: (key: string, ts: number) => void
  getSource?: (...args: any[]) => string
  maxSize?: number
  timeout?: number
}

export const makeLoadItem = <T>(
  loadItem: LoadItem,
  getItem: GetItem<T>,
  options: MakeLoadItemOptions = {},
) => {
  const timeout = options.timeout || 3600
  const maxSize = options.maxSize || 10_000
  const fetched = new LRUCache<string, number>(maxSize)
  const getFetched = options.getFetched || ((key: string) => fetched.get(key) || 0)
  const setFetched = options.setFetched || ((key: string, ts: number) => fetched.set(key, ts))
  const getSource = options.getSource || ((...args: any[]) => JSON.stringify(args))
  const sourceFetched = new LRUCache<string, number>(maxSize)
  const attempts = new LRUCache<string, number>(maxSize)
  const pending = new Map<string, Promise<Maybe<T>>>()

  return async (key: string, ...args: any[]): Promise<Maybe<T>> => {
    const stale = await getItem(key)

    // If we have an item, reload if it's relatively recent
    if (stale && getFetched(key) > now() - timeout) {
      return stale
    }

    const source = `${key}:${getSource(...args)}`
    const pendingItem = pending.get(source)

    // If we already are loading from this source, await and return
    if (pendingItem) {
      return pendingItem
    }

    const attempt = attempts.get(source) || 0

    // Use exponential backoff to throttle repeat attempts against the same source
    if (gt(sourceFetched.get(source), now() - Math.pow(2, attempt))) {
      return stale
    }

    attempts.set(source, attempt + 1)
    sourceFetched.set(source, now())

    setFetched(key, now())

    const promise = loadItem(key, ...args).then(() => getItem(key))

    pending.set(source, promise)

    let item

    try {
      item = await promise
    } finally {
      pending.delete(source)
    }

    if (item) {
      attempts.pop(source)
    }

    return item
  }
}

// Miscellaneous other stuff

export const deriveIsDeleted = (repository: Repository, event: TrustedEvent): Projection<boolean> =>
  projection(
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
    }),
    () => repository.isDeleted(event),
  )
