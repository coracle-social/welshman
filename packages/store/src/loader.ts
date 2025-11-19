import {Maybe, now} from "@welshman/lib"

export type LoaderOptions<T> = {
  getItem: (key: string) => T
  getLastFetched: (key: string) => number
  setLastFetched: (key: string, ts: number) => void
  load: (key: string, ...args: any[]) => Promise<unknown>
  timeout?: number
}

export const makeLoader = <T>(options: LoaderOptions<T>) => {
  const timeout = options.timeout || 3600
  const pending = new Map<string, Promise<Maybe<T>>>()
  const attempts = new Map<string, number>()

  const baseLoad = async (key: string, force: boolean, ...args: any[]): Promise<Maybe<T>> => {
    const stale = options.getItem(key)
    const lastFetched = options.getLastFetched(key)

    // If we have an item, reload if it's stale
    if (stale && lastFetched > now() - timeout && !force) {
      return stale
    }

    const pendingItem = pending.get(key)

    // If we already are loading, await and return
    if (pendingItem) {
      return pendingItem
    }

    const attempt = attempts.get(key) || 0

    // Use exponential backoff to throttle attempts
    if (lastFetched > now() - Math.pow(2, attempt) && !force) {
      return stale
    }

    attempts.set(key, attempt + 1)

    options.setLastFetched(key, now())

    const promise = options.load(key, ...args).then(() => options.getItem(key))

    pending.set(key, promise)

    let item
    try {
      item = await promise
    } catch (e) {
      console.warn(`Failed to load ${name} item ${key}`, e)
    } finally {
      pending.delete(key)
    }

    if (item) {
      attempts.delete(key)
    }

    return item
  }

  const load = (key: string, ...args: any[]) => baseLoad(key, false, ...args)

  const forceLoad = (key: string, ...args: any[]) => baseLoad(key, true, ...args)

  return {load, forceLoad}
}
