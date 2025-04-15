import {readable, derived, type Readable, type Subscriber} from "svelte/store"
import {indexBy, remove, now} from "@welshman/lib"
import {ReadableWithGetter, withGetter} from "@welshman/store"
import {getFreshness, setFreshnessThrottled} from "./freshness.js"

export type CachedLoaderOptions<T> = {
  name: string
  indexStore: ReadableWithGetter<Map<string, T>>
  load: (key: string, relays: string[]) => Promise<any>
  subscribers?: Subscriber<T>[]
}

export const makeCachedLoader = <T>({name, load, indexStore, subscribers = []}: CachedLoaderOptions<T>) => {
  const pending = new Map<string, Promise<T | void>>()
  const loadAttempts = new Map<string, number>()

  return async (key: string, relays: string[] = []) => {
    const stale = indexStore.get().get(key)

    // If we have no loader function, nothing we can do
    if (!load) {
      return stale
    }

    const freshness = getFreshness(name, key)

    // If we have an item, reload if it's stale
    if (stale && freshness > now() - 3600) {
      return stale
    }

    // If we already are loading, await and return
    if (pending.has(key)) {
      return pending.get(key)!.then(() => indexStore.get().get(key))
    }

    const attempt = loadAttempts.get(key) || 0

    // Use exponential backoff to throttle attempts
    if (freshness > now() - Math.pow(2, attempt)) {
      return stale
    }

    loadAttempts.set(key, attempt + 1)

    setFreshnessThrottled({ns: name, key, ts: now()})

    const promise = load(key, relays)

    pending.set(key, promise)

    try {
      await promise
    } catch (e) {
      console.warn(`Failed to load ${name} item ${key}`, e)
    } finally {
      pending.delete(key)
    }

    const fresh = indexStore.get().get(key)

    if (fresh) {
      loadAttempts.delete(key)

      for (const subscriber of subscribers) {
        subscriber(fresh)
      }
    }

    return fresh
  }
}

export type CollectionOptions<T> = {
  name: string
  store: Readable<T[]>
  getKey: (item: T) => string
  load: (key: string, relays: string[]) => Promise<any>
}

export const collection = <T>({name, store, getKey, load}: CollectionOptions<T>) => {
  const indexStore = withGetter(derived(store, $items => indexBy(getKey, $items)))

  let subscribers: Subscriber<T>[] = []

  const loadItem = makeCachedLoader({name, load, indexStore, subscribers})

  const deriveItem = (key: string | undefined, relays: string[] = []) => {
    if (!key) {
      return readable(undefined)
    }

    // If we don't yet have the item, or it's stale, trigger a request for it. The derived
    // store will update when it arrives
    loadItem(key, relays)

    return derived(indexStore, $index => $index.get(key))
  }

  const onItem = (cb: Subscriber<T>) => {
    subscribers.push(cb)

    return () => {
      subscribers = remove(cb, subscribers)
    }
  }

  return {indexStore, deriveItem, loadItem, onItem}
}
