import {writable} from "svelte/store"
import {getJson, setJson} from "@welshman/lib"

export interface StorageProvider {
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<void>
}

export interface SyncedConfig<T> {
  key: string
  storage: StorageProvider
  defaultValue: T
}

export const localStorageProvider: StorageProvider = {
  get: async (key: string) => getJson(key),
  set: async (key: string, value: any) => setJson(key, value),
}

export const synced = <T>(config: SyncedConfig<T>) => {
  const {key, storage, defaultValue} = config
  const store = writable<T>(defaultValue)

  // Async initialization
  storage.get(key).then((value: any) => {
    if (value !== undefined) {
      store.set(value)
    }
  })

  // Subscribe to changes
  store.subscribe(async (value: T) => {
    await storage.set(key, value)
  })

  return store
}
