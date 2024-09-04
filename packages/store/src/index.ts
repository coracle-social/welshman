import {throttle} from "throttle-debounce"
import {derived, writable} from "svelte/store"
import type {Readable, Updater, Writable, Subscriber, Unsubscriber} from "svelte/store"
import {identity, getJson, setJson, batch, partition, first} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import type {Repository} from "@welshman/util"
import {matchFilters, getIdAndAddress, getIdFilters} from "@welshman/util"
import type {Filter, TrustedEvent} from "@welshman/util"

// Generic store utils

export const synced = <T>(key: string, defaultValue: T) => {
  const init = getJson(key)
  const store = writable<T>(init === null ? defaultValue : init)

  store.subscribe((value: T) => setJson(key, value))

  return store
}

export const getter = <T>(store: Readable<T>) => {
  let value: T

  store.subscribe((newValue: T) => {
    value = newValue
  })

  return () => value
}

export function withGetter<T>(store: Writable<T>): Writable<T> & {get: () => T}
export function withGetter<T>(store: Readable<T>): Readable<T> & {get: () => T}
export function withGetter<T>(store: Readable<T> | Writable<T>) {
  return {...store, get: getter<T>(store)}
}

type Start<T> = (set: Subscriber<T>) => Unsubscriber

export const custom = <T>(start: Start<T>, opts: {throttle?: number} = {}) => {
  const subs: Subscriber<T>[] = []

  let value: T
  let stop: () => void

  const set = (newValue: T) => {
    for (const sub of subs) {
      sub(newValue)
    }

    value = newValue
  }

  return {
    set,
    subscribe: (sub: Subscriber<T>) => {
      if (opts.throttle) {
        sub = throttle(opts.throttle, sub)
      }

      if (subs.length === 0) {
        stop = start(set)
      }

      subs.push(sub)
      sub(value)

      return () => {
        subs.splice(
          subs.findIndex(s => s === sub),
          1,
        )

        if (subs.length === 0) {
          stop()
        }
      }
    },
  }
}

export const adapter = <Source, Target>({
  store,
  forward,
  backward,
}: {
  store: Writable<Source>,
  forward: (x: Source) => Target,
  backward: (x: Target) => Source,
}) => ({
  ...derived(store, forward),
  set: (x: Target) => store.set(backward(x)),
  update: (f: (x: Target) => Target) => store.update((x: Source) => backward(f(forward(x)))),
})

export const throttled = <T>(delay: number, store: Readable<T>) =>
  custom<T>(set => store.subscribe(throttle(delay, set)))

// Event related stores

export const createEventStore = (repository: Repository): Writable<TrustedEvent[]> => {
  let subs: Subscriber<TrustedEvent[]>[] = []

  const onUpdate = () => {
    const $events = repository.dump()

    for (const sub of subs) {
      sub($events)
    }
  }

  return {
    set: (events: TrustedEvent[]) => repository.load(events),
    update: (f: Updater<TrustedEvent[]>) => repository.load(f(repository.dump())),
    subscribe: (f: Subscriber<TrustedEvent[]>) => {
      f(repository.dump())

      subs.push(f)

      if (subs.length === 1) {
        repository.on("update", onUpdate)
      }

      return () => {
        subs = subs.filter(x => x !== f)

        if (subs.length === 0) {
          repository.off("update", onUpdate)
        }
      }
    },
  }
}

export const deriveEventsMapped = <T>(repository: Repository, {
  filters,
  eventToItem,
  itemToEvent,
  throttle = 0,
  includeDeleted = false,
}: {
  filters: Filter[]
  eventToItem: (event: TrustedEvent) => Maybe<T | Promise<T>>
  itemToEvent: (item: T) => TrustedEvent
  throttle?: number
  includeDeleted?: boolean
}) =>
  custom<T[]>(setter => {
    let data: T[] = []
    const deferred = new Set()

    const defer = (event: TrustedEvent, item: Promise<T>) => {
      deferred.add(event.id)

      item.then($item => {
        if (deferred.has(event.id)) {
          deferred.delete(event.id)
          data.push($item)
          setter(data)
        }
      })
    }

    for (const event of repository.query(filters, {includeDeleted})) {
      const item = eventToItem(event)

      if (!item) {
        continue
      }

      if (item instanceof Promise) {
        defer(event, item)
      } else {
        data.push(item)
      }
    }

    setter(data)

    const onUpdate = batch(300, (updates: {added: TrustedEvent[]; removed: Set<string>}[]) => {
      const removed = new Set()
      const added = new Map()

      // Apply updates in order
      for (const update of updates) {
        for (const event of update.added.values()) {
          added.set(event.id, event)
        }

        for (const id of update.removed) {
          removed.add(id)
          added.delete(id)
          deferred.delete(id)
        }
      }

      let dirty = false
      for (const event of added.values()) {
        if (matchFilters(filters, event)) {
          const item = eventToItem(event)

          if (item instanceof Promise) {
            defer(event, item)
          } else if (item) {
            dirty = true
            data.push(item as T)
          }
        }
      }

      if (!includeDeleted && removed.size > 0) {
        const [deleted, ok] = partition(
          (item: T) => getIdAndAddress(itemToEvent(item)).some((id: string) => removed.has(id)),
          data,
        )

        if (deleted.length > 0) {
          dirty = true
          data = ok
        }
      }

      if (dirty) {
        setter(data)
      }
    })

    repository.on("update", onUpdate)

    return () => repository.off("update", onUpdate)
  }, {throttle})

export const deriveEvents = (repository: Repository, opts: {filters: Filter[], includeDeleted?: boolean}) =>
  deriveEventsMapped<TrustedEvent>(repository, {
    ...opts,
    eventToItem: identity,
    itemToEvent: identity,
  })

export const deriveEvent = (repository: Repository, idOrAddress: string) =>
  derived(
    deriveEvents(repository, {
      filters: getIdFilters([idOrAddress]),
      includeDeleted: true,
    }),
    first
  )

export const deriveIsDeletedByAddress = (repository: Repository, event: TrustedEvent) =>
  custom<boolean>(setter => {
    setter(repository.isDeletedByAddress(event))

    const onUpdate = batch(300, () => setter(repository.isDeletedByAddress(event)))

    repository.on("update", onUpdate)

    return () => repository.off("update", onUpdate)
  })
