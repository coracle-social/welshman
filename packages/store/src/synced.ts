import {writable, Writable} from "svelte/store"
import {getJson, setJson} from "@welshman/lib"

export interface StorageProvider {
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<void>
}

export const localStorageProvider: StorageProvider = {
  get: async (key: string) => getJson(key),
  set: async (key: string, value: any) => setJson(key, value),
}

export interface SyncConfig<T> {
  key: string
  store: Writable<T>
  storage: StorageProvider
}

export const sync = <T>({key, store, storage}: SyncConfig<T>) => {
  storage.get(key).then((value: T | undefined) => {
    if (value !== undefined) {
      store.set(value)
    }
  })

  store.subscribe(async (value: T) => {
    await storage.set(key, value)
  })
}

export interface SyncedConfig<T> {
  key: string
  storage: StorageProvider
  defaultValue: T
}

export const synced = <T>({key, storage, defaultValue}: SyncedConfig<T>) => {
  const store = writable<T>(defaultValue)

  sync({key, store, storage})

  return store
}
