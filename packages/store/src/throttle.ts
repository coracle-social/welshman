import {Readable, Subscriber} from "svelte/store"
import {throttle} from "@welshman/lib"

export const throttled = <T, S extends Readable<T>>(delay: number, store: S) => {
  if (delay) {
    const {subscribe} = store

    store = {...store, subscribe: (f: Subscriber<T>) => subscribe(throttle(delay, f))}
  }

  return store
}
