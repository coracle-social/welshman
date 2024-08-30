import {readable, derived, type Readable} from 'svelte/store'
import {indexBy, type Maybe, now} from '@welshman/lib'
import {withGetter} from '@welshman/store'
import {getFreshness, setFreshness} from './freshness'

export const collection = <T>({
  name,
  store,
  getKey,
  load,
}: {
  name: string
  store: Readable<T[]>
  getKey: (item: T) => string
  load: (key: string, ...args: any) => Promise<any>
}) => {
  const indexStore = withGetter(derived(store, $items => indexBy(getKey, $items)))
  const getItem = (key: string) => indexStore.get().get(key)
  const pending = new Map<string, Promise<Maybe<T>>>()

  const loadItem = async (key: string, ...args: any[]) => {
    if (getFreshness(name, key) > now() - 3600) {
      return indexStore.get().get(key)
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

  const deriveItem = (key: Maybe<string>, ...args: any[]) => {
    if (!key) {
      return readable(undefined)
    }

    // If we don't yet have the item, or it's stale, trigger a request for it. The derived
    // store will update when it arrives
    load(key, ...args)

    return derived(indexStore, $index => $index.get(key))
  }

  return {indexStore, deriveItem, loadItem, getItem}
}
