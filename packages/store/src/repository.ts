import {derived} from "svelte/store"
import {
  sortBy,
  identity,
  ensurePlural,
  removeUndefined,
  batch,
  partition,
  first,
} from "@welshman/lib"
import {matchFilters, getIdAndAddress, getIdFilters, Filter, TrustedEvent} from "@welshman/util"
import {Repository} from "@welshman/net"
import {custom} from "./custom.js"

export type DeriveEventsMappedOptions<T> = {
  filters: Filter[]
  eventToItem: (event: TrustedEvent) => undefined | T | T[] | Promise<undefined | T | T[]>
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

      const defer = (event: TrustedEvent, promise: Promise<undefined | T | T[]>) => {
        deferred.add(event.id)

        void promise.then(items => {
          if (deferred.has(event.id)) {
            deferred.delete(event.id)

            for (const item of removeUndefined(ensurePlural(items))) {
              data.push(item)
            }

            setter(sortBy(item => -itemToEvent(item).created_at, data))
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
          for (const item of removeUndefined(ensurePlural(items))) {
            data.push(item)
          }
        }
      }

      setter(sortBy(item => -itemToEvent(item).created_at, data))

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

              for (const item of removeUndefined(ensurePlural(items))) {
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
          setter(sortBy(item => -itemToEvent(item).created_at, data))
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
