import {derived, Readable, Subscriber, Stores, StoresValues} from "svelte/store"
import {memoize} from "@welshman/lib"

export const memoized = <T>(store: Readable<T>) => {
  const {subscribe} = store

  return {...store, subscribe: (f: Subscriber<T>) => subscribe(memoize(f))}
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
