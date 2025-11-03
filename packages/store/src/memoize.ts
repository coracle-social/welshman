import {Readable, Subscriber} from "svelte/store"
import {memoize} from "@welshman/lib"

export const memoized = <T>(store: Readable<T>) => {
  const {subscribe} = store

  return {...store, subscribe: (f: Subscriber<T>) => subscribe(memoize(f))}
}
