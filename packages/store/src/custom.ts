import {Subscriber, Unsubscriber} from "svelte/store"
import {throttle} from "@welshman/lib"
import {WritableWithGetter} from "./getter.js"

type Start<T> = (set: Subscriber<T>) => Unsubscriber

export type CustomStoreOpts<T> = {
  throttle?: number
  set?: (x: T) => void
}

export const custom = <T>(
  start: Start<T>,
  opts: CustomStoreOpts<T> = {},
): WritableWithGetter<T> => {
  const subs: Subscriber<T>[] = []

  let value: T
  let stop: () => void

  const set = (newValue: T) => {
    for (const sub of subs) {
      sub(newValue)
    }

    value = newValue
  }

  return {
    get: () => value,
    set: (newValue: T) => {
      set(newValue)
      opts.set?.(newValue)
    },
    update: (f: (value: T) => T) => {
      const newValue = f(value)

      set(newValue)
      opts.set?.(newValue)
    },
    subscribe: (sub: Subscriber<T>) => {
      if (opts.throttle) {
        sub = throttle(opts.throttle, sub)
      }

      if (subs.length === 0) {
        stop = start(set)
      }

      subs.push(sub)
      sub(value)

      return () => {
        subs.splice(
          subs.findIndex(s => s === sub),
          1,
        )

        if (subs.length === 0) {
          stop()
        }
      }
    },
  }
}
