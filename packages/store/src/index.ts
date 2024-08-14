import {throttle} from "throttle-debounce"
import {derived} from "svelte/store"
import type {Readable, Writable} from "svelte/store"
import {identity, batch, partition, first} from "@welshman/lib"
import type {Repository} from "@welshman/util"
import {matchFilters, getIdAndAddress, getIdFilters} from "@welshman/util"
import type {Filter, CustomEvent} from "@welshman/util"

export const getter = <T>(store: Readable<T>) => {
  let value: T

  store.subscribe((newValue: T) => {
    value = newValue
  })

  return () => value
}

type Stop = () => void
type Sub<T> = (x: T) => void
type Start<T> = (set: Sub<T>) => Stop

export const custom = <T>(start: Start<T>, opts: {throttle?: number} = {}) => {
  const subs: Sub<T>[] = []

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
    subscribe: (sub: Sub<T>) => {
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

export function withGetter<T>(store: Writable<T>): Writable<T> & {get: () => T}
export function withGetter<T>(store: Readable<T>): Readable<T> & {get: () => T}
export function withGetter<T>(store: Readable<T> | Writable<T>) {
  return {...store, get: getter<T>(store)}
}

export const throttled = <T>(delay: number, store: Readable<T>) =>
  custom(set => store.subscribe(throttle(delay, set)))

export const createEventStore = (repository: Repository) => {
  let subs: Sub<CustomEvent[]>[] = []

  const onUpdate = throttle(300, () => {
    const $events = repository.dump()

    for (const sub of subs) {
      sub($events)
    }
  })

  return {
    get: () => repository.dump(),
    set: (events: CustomEvent[]) => repository.load(events),
    subscribe: (f: Sub<CustomEvent[]>) => {
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

export const deriveEventsMapped = <T>({
  filters,
  repository,
  eventToItem,
  itemToEvent,
  throttle = 300,
  includeDeleted = false,
}: {
  filters: Filter[]
  repository: Repository,
  eventToItem: (event: CustomEvent) => T | Promise<T>
  itemToEvent: (item: T) => CustomEvent
  throttle?: number
  includeDeleted?: boolean
}) =>
  custom<T[]>(setter => {
    let data: T[] = []
    const deferred = new Set()

    const defer = (event: CustomEvent, item: Promise<T>) => {
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

    const onUpdate = batch(300, (updates: {added: CustomEvent[]; removed: Set<string>}[]) => {
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

export const deriveEvents = (opts: {repository: Repository, filters: Filter[], includeDeleted?: boolean}) =>
  deriveEventsMapped<CustomEvent>({
    ...opts,
    eventToItem: identity,
    itemToEvent: identity,
  })

export const deriveEvent = ({repository, idOrAddress}: {repository: Repository, idOrAddress: string}) =>
  derived(
    deriveEvents({
      repository,
      filters: getIdFilters([idOrAddress]),
      includeDeleted: true,
    }),
    first
  )

export const deriveIsDeletedByAddress = ({repository, event}: {repository: Repository, event: CustomEvent}) =>
  custom<boolean>(setter => {
    setter(repository.isDeletedByAddress(event))

    const onUpdate = batch(300, () => setter(repository.isDeletedByAddress(event)))

    repository.on("update", onUpdate)

    return () => repository.off("update", onUpdate)
  })
