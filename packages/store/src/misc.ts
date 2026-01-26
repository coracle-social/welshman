import {get, derived, Readable, Unsubscriber, Writable, Subscriber} from "svelte/store"
import {memoize, equals, throttle} from "@welshman/lib"

// Define Stores and StoresValues types locally since they're not exported in Svelte 5
type Stores = Readable<any> | [Readable<any>, ...Array<Readable<any>>] | Array<Readable<any>>
type StoresValues<T> =
  T extends Readable<infer U> ? U : {[K in keyof T]: T[K] extends Readable<infer U> ? U : never}

// Smart getter that adjusts between svelte's get and aggressive subscription depending on how hot
// the path is

export const getter = <T>(store: Readable<T>, {threshold = 10}: {threshold?: number} = {}) => {
  const calls: number[] = []
  let unsubscribe: Unsubscriber | undefined
  let offset = 0
  let value: T

  return () => {
    const now = Date.now()
    const cutoff = now - 1000

    // Find the first timestamp within the window (avoid expensive shift)
    while (offset < calls.length && calls[offset] < cutoff) {
      offset++
    }

    // Periodically clean up old timestamps to prevent unbounded growth
    if (offset > 100) {
      calls.splice(0, offset)
      offset = 0
    }

    // Add current timestamp
    calls.push(now)

    // Check if call rate exceeds threshold and switch to more aggressive mode
    if (calls.length - offset > threshold) {
      if (!unsubscribe) {
        unsubscribe = store.subscribe((newValue: T) => {
          value = newValue
        })
      }

      return value
    } else {
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = undefined
      }

      return get(store)
    }
  }
}

export type WritableWithGetter<T> = Writable<T> & {get: () => T}
export type ReadableWithGetter<T> = Readable<T> & {get: () => T}

export function withGetter<T>(store: Writable<T>): WritableWithGetter<T>
export function withGetter<T>(store: Readable<T>): ReadableWithGetter<T>
export function withGetter<T>(store: Readable<T> | Writable<T>) {
  return {...store, get: getter<T>(store)}
}

export const memoized = <T>(store: Readable<T>) => {
  const {subscribe} = store

  return {...store, subscribe: (f: Subscriber<T>) => subscribe(memoize(f))}
}

export const throttled = <T, S extends Readable<T>>(delay: number, store: S) => {
  if (delay) {
    const {subscribe} = store

    store = {...store, subscribe: (f: Subscriber<T>) => subscribe(throttle(delay, f))}
  }

  return store
}

export const deriveDeduplicated = <S extends Stores, T>(
  stores: S,
  get: (storeValues: StoresValues<S>) => T,
): Readable<T> => {
  let prev: T

  return derived(stores, (storeValues, set) => {
    const result = get(storeValues)

    if (prev !== result) {
      prev = result
      set(result)
    }
  })
}

export const deriveDeduplicatedByValue = <S extends Stores, T>(
  stores: S,
  get: (storeValues: StoresValues<S>) => T,
): Readable<T> => {
  let prev: T

  return derived(stores, (storeValues, set) => {
    const result = get(storeValues)

    if (!equals(prev, result)) {
      prev = result
      set(result)
    }
  })
}
