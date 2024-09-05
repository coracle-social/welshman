import {readable, derived, type Readable} from 'svelte/store'
import {type SubscribeRequest} from "@welshman/net"
import {indexBy, type Maybe, now} from '@welshman/lib'
import {getIdFilters} from '@welshman/util'
import type {TrustedEvent} from '@welshman/util'
import {withGetter, deriveEvents} from '@welshman/store'
import {repository, load} from './core'
import {getFreshness, setFreshness} from './freshness'

export const collection = <T, LoadArgs extends any[]>({
  name,
  store,
  getKey,
  load,
}: {
  name: string
  store: Readable<T[]>
  getKey: (item: T) => string
  load: (key: string, ...args: LoadArgs) => Promise<any>
}) => {
  const indexStore = withGetter(derived(store, $items => indexBy(getKey, $items)))
  const getItem = (key: string) => indexStore.get().get(key)
  const pending = new Map<string, Promise<Maybe<T>>>()

  const loadItem = async (key: string, ...args: LoadArgs) => {
    const item = indexStore.get().get(key)
    const delta = item ? 3600 : 30

    if (getFreshness(name, key) > now() - delta) {
      return item
    }

    if (pending.has(key)) {
      await pending.get(key)
    } else {
      setFreshness(name, key, now())

      const promise = load(key, ...args)

      pending.set(key, promise)

      await promise

      pending.delete(key)
    }

    return indexStore.get().get(key)
  }

  const deriveItem = (key: Maybe<string>, ...args: LoadArgs) => {
    if (!key) {
      return readable(undefined)
    }

    // If we don't yet have the item, or it's stale, trigger a request for it. The derived
    // store will update when it arrives
    loadItem(key, ...args)

    return derived(indexStore, $index => $index.get(key))
  }

  return {indexStore, deriveItem, loadItem, getItem}
}

export const deriveEvent = (idOrAddress: string, request: Partial<SubscribeRequest> = {}) => {
  let attempted = false

  const filters = getIdFilters([idOrAddress])

  return derived(
    deriveEvents(repository, {filters, includeDeleted: true}),
    (events: TrustedEvent[]) => {
      if (!attempted && events.length === 0) {
        load({...request, filters})
        attempted = true
      }

      return events[0]
    },
  )
}
