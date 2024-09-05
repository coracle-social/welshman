import {readable, derived, type Readable} from 'svelte/store'
import {indexBy, type Maybe, now} from '@welshman/lib'
import {withGetter} from '@welshman/store'
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
  const loadAttempts = new Map<string, number>()

  const loadItem = async (key: string, ...args: LoadArgs) => {
    const item = undefined//indexStore.get().get(key)
    const freshness = getFreshness(name, key)

    if (name === 'zappers' && key === '6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93') {
      console.log(item)
    }

    // If we have an item, reload anyway if it's stale. If not, retry with exponential backoff
    if (item) {
      loadAttempts.delete(key)

      if (freshness > now() - 3600) {
        return item
      }
    } else {
      const attempt = loadAttempts.get(key) || 0

      if (freshness > now() - Math.pow(2, attempt)) {
        return undefined
      }

      loadAttempts.set(key, attempt + 1)
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
