import {Readable, Writable} from "svelte/store"

export const getter = <T>(store: Readable<T>) => {
  let value: T

  store.subscribe((newValue: T) => {
    value = newValue
  })

  return () => value
}

export type WritableWithGetter<T> = Writable<T> & {get: () => T}
export type ReadableWithGetter<T> = Readable<T> & {get: () => T}

export function withGetter<T>(store: Writable<T>): WritableWithGetter<T>
export function withGetter<T>(store: Readable<T>): ReadableWithGetter<T>
export function withGetter<T>(store: Readable<T> | Writable<T>) {
  return {...store, get: getter<T>(store)}
}
