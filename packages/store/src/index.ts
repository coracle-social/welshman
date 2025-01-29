import {derived, writable} from "svelte/store"
import type {Readable, Writable, Subscriber, Unsubscriber} from "svelte/store"
import {
  identity,
  throttle,
  ensurePlural,
  getJson,
  setJson,
  batch,
  partition,
  first,
} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import type {Repository} from "@welshman/util"
import {matchFilters, getIdAndAddress, getIdFilters} from "@welshman/util"
import type {Filter, TrustedEvent} from "@welshman/util"

// Sync with localstorage

export const synced = <T>(key: string, defaultValue: T) => {
  const init = getJson(key)
  const store = writable<T>(init === undefined ? defaultValue : init)

  store.subscribe((value: T) => setJson(key, value))

  return store
}

// Getters

export const getter = <T>(store: Readable<T>) => {
  let value: T

  store.subscribe((newValue: T) => {
    value = newValue
  })

  return () => value
}

export type WritableWithGetter<T> = Writable<T> & {get: () => T}
export type ReadableWithGetter<T> = Readable<T> & {get: () => T}

export function withGetter<T>(store: Writable<T>): WritableWithGetter<T>
export function withGetter<T>(store: Readable<T>): ReadableWithGetter<T>
export function withGetter<T>(store: Readable<T> | Writable<T>) {
  return {...store, get: getter<T>(store)}
}

// Throttle

export const throttled = <T, S extends Readable<T>>(delay: number, store: S) => {
  if (delay) {
    const {subscribe} = store

    store = {...store, subscribe: (f: Subscriber<T>) => subscribe(throttle(delay, f))}
  }

  return store
}

// Custom store

type Start<T> = (set: Subscriber<T>) => Unsubscriber

export type CustomStoreOpts<T> = {
  throttle?: number
  set?: (x: T) => void
}

export const custom = <T>(
  start: Start<T>,
  opts: CustomStoreOpts<T> = {},
): WritableWithGetter<T> => {
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
    get: () => value,
    set: (newValue: T) => {
      set(newValue)
      opts.set?.(newValue)
    },
    update: (f: (value: T) => T) => {
      const newValue = f(value)

      set(newValue)
      opts.set?.(newValue)
    },
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

// Simple adapter

export const adapter = <Source, Target>({
  store,
  forward,
  backward,
}: {
  store: Writable<Source>
  forward: (x: Source) => Target
  backward: (x: Target) => Source
}) => ({
  ...derived(store, forward),
  set: (x: Target) => store.set(backward(x)),
  update: (f: (x: Target) => Target) => store.update((x: Source) => backward(f(forward(x)))),
})

// Event related stores

export type DeriveEventsMappedOptions<T> = {
  filters: Filter[]
  eventToItem: (event: TrustedEvent) => Maybe<T | T[] | Promise<T | T[]>>
  itemToEvent: (item: T) => TrustedEvent
  throttle?: number
  includeDeleted?: boolean
}

export const deriveEventsMapped = <T>(
  repository: Repository,
  {
    filters,
    eventToItem,
    itemToEvent,
    throttle = 0,
    includeDeleted = false,
  }: DeriveEventsMappedOptions<T>,
) =>
  custom<T[]>(
    setter => {
      let data: T[] = []
      const deferred = new Set()

      const defer = (event: TrustedEvent, promise: Promise<T | T[]>) => {
        deferred.add(event.id)

        void promise.then(items => {
          if (deferred.has(event.id)) {
            deferred.delete(event.id)

            for (const item of ensurePlural(items)) {
              data.push(item)
            }

            setter(data)
          }
        })
      }

      for (const event of repository.query(filters, {includeDeleted})) {
        const items = eventToItem(event)

        if (!items) {
          continue
        }

        if (items instanceof Promise) {
          defer(event, items)
        } else {
          for (const item of ensurePlural(items)) {
            data.push(item)
          }
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
            removed.delete(event.id)
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
            const items = eventToItem(event)

            if (items instanceof Promise) {
              defer(event, items)
            } else if (items) {
              dirty = true

              for (const item of ensurePlural(items)) {
                data.push(item as T)
              }
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
    },
    {throttle},
  )

export type DeriveEventsOptions<T> = Omit<
  DeriveEventsMappedOptions<T>,
  "itemToEvent" | "eventToItem"
>

export const deriveEvents = <T>(repository: Repository, opts: DeriveEventsOptions<T>) =>
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
    first,
  )

export const deriveIsDeleted = (repository: Repository, event: TrustedEvent) =>
  custom<boolean>(setter => {
    setter(repository.isDeleted(event))

    const onUpdate = batch(300, () => setter(repository.isDeleted(event)))

    repository.on("update", onUpdate)

    return () => repository.off("update", onUpdate)
  })

export const deriveIsDeletedByAddress = (repository: Repository, event: TrustedEvent) =>
  custom<boolean>(setter => {
    setter(repository.isDeletedByAddress(event))

    const onUpdate = batch(300, () => setter(repository.isDeletedByAddress(event)))

    repository.on("update", onUpdate)

    return () => repository.off("update", onUpdate)
  })
