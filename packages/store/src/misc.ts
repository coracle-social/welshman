import {get, derived, Readable, Unsubscriber, Writable, Subscriber} from "svelte/store"
import {memoize, identity, equals, throttle} from "@welshman/lib"

// Define Stores and StoresValues types locally since they're not exported in Svelte 5
type Stores = Readable<any> | [Readable<any>, ...Array<Readable<any>>] | Array<Readable<any>>
type StoresValues<T> =
  T extends Readable<infer U> ? U : {[K in keyof T]: T[K] extends Readable<infer U> ? U : never}

// Smart getter that adjusts between svelte's get and aggressive subscription depending on how hot
// the path is

export type GetterOptions<T> = {
  threshold?: number
  // How to read the current value without subscribing. Defaults to `get(store)`, which stands the
  // store up and tears it down again — pass a direct query when one is cheaper.
  read?: () => T
}

export const getter = <T>(store: Readable<T>, {threshold = 10, read}: GetterOptions<T> = {}) => {
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

      return read ? read() : get(store)
    }
  }
}

export type WritableWithGetter<T> = Writable<T> & {get: () => T}
export type ReadableWithGetter<T> = Readable<T> & {get: () => T}

// Keeps whatever else the store carries (e.g. `synced`'s `ready`) alongside `get`.
export const withGetter = <S extends Readable<any>>(store: S) =>
  ({...store, get: getter<StoresValues<S>>(store)}) as S & {get: () => StoresValues<S>}

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

export const merged = <S extends Stores>(stores: S) => derived(stores, identity)

/**
 * Utility type which allows for using the same value both for hot gets and derived
 * subscriptions. It is a store itself, so `derived(someProjection, ...)` works as well
 * as `derived(someProjection.$, ...)`.
 */
export type Projection<T> = ReadableWithGetter<T> & {
  $: Readable<T>
}

/**
 * Build a `Projection` from a readable store and an optional `read` function, which falls
 * back to `get($)`. On hot paths, the store value is cached, and read is skipped.
 */
export const projection = <T>($: Readable<T>, read?: () => T): Projection<T> => ({
  $,
  subscribe: $.subscribe,
  get: getter($, {read}),
})

/**
 * Build a `Projection` derived from another `Projection`: re-read `src`
 * reactively via `.$` or synchronously via `.get()`.
 */
export const projectFrom = <S, U>(src: Projection<S>, read: ($: S) => U): Projection<U> =>
  projection(derived(src.$, read), () => read(src.get()))
