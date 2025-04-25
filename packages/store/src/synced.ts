import {writable} from "svelte/store"
import {getJson, setJson} from "@welshman/lib"

export const synced = <T>(key: string, defaultValue: T) => {
  const init = getJson(key)
  const store = writable<T>(init === undefined ? defaultValue : init)

  store.subscribe((value: T) => setJson(key, value))

  return store
}
