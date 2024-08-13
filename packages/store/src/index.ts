import {throttle} from "throttle-debounce"
import {derived} from "svelte/store"
import type {Readable, Writable} from "svelte/store"
import {identity, batch, partition, first} from "@welshman/lib"
import type {Repository} from "@welshman/util"
import {matchFilters, getIdAndAddress, getIdFilters} from "@welshman/util"
import type {Filter, TrustedEvent} from "@welshman/util"

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

  return {
    subscribe: (sub: Sub<T>) => {
      if (opts.throttle) {
        sub = throttle(opts.throttle, sub)
      }

      if (subs.length === 0) {
        stop = start((newValue: T) => {
          for (const sub of subs) {
            sub(newValue)
          }

          value = newValue
        })
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

export const createEventStore = <E extends TrustedEvent>(repository: Repository<E>) => {
  let subs: Sub<E[]>[] = []

  const onUpdate = throttle(300, () => {
    const $events = repository.dump()

    for (const sub of subs) {
      sub($events)
    }
  })

  return {
    get: () => repository.dump(),
    set: (events: E[]) => repository.load(events),
    subscribe: (f: Sub<E[]>) => {
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

export const deriveEventsMapped = <E extends TrustedEvent, T>({
  filters,
  repository,
  eventToItem,
  itemToEvent,
  includeDeleted = false,
}: {
  filters: Filter[]
  repository: Repository<E>,
  eventToItem: (event: E) => T
  itemToEvent: (item: T) => E
  includeDeleted?: boolean
}) =>
  custom<T[]>(setter => {
    let data = repository.query(filters, {includeDeleted}).map(eventToItem).filter(identity)

    setter(data)

    const onUpdate = batch(300, (updates: {added: E[]; removed: Set<string>}[]) => {
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
        }
      }

      let dirty = false
      for (const event of added.values()) {
        if (matchFilters(filters, event)) {
          const item = eventToItem(event)

          if (item) {
            dirty = true
            data.push(item)
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
  })

export const deriveEvents = <E extends TrustedEvent>(repository: Repository<E>, opts: {filters: Filter[]; includeDeleted?: boolean}) =>
  deriveEventsMapped<E, E>({
    ...opts,
    repository,
    eventToItem: identity,
    itemToEvent: identity,
  })

export const deriveEvent = <E extends TrustedEvent>(repository: Repository<E>, idOrAddress: string) =>
  derived(
    deriveEvents(repository, {
      filters: getIdFilters([idOrAddress]),
      includeDeleted: true,
    }),
    first
  )

export const deriveIsDeletedByAddress = <E extends TrustedEvent>(repository: Repository<E>, event: E) =>
  custom<boolean>(setter => {
    setter(repository.isDeletedByAddress(event))

    const onUpdate = batch(300, () => setter(repository.isDeletedByAddress(event)))

    repository.on("update", onUpdate)

    return () => repository.off("update", onUpdate)
  })
