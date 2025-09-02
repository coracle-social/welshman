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

export const sync = async <T>({key, store, storage}: SyncConfig<T>) => {
  const storedValue = await storage.get(key)

  if (storedValue !== undefined) {
    store.set(storedValue)
  }

  store.subscribe(async (value: T) => {
    await storage.set(key, value)
  })
}

export interface SyncedConfig<T> {
  key: string
  storage: StorageProvider
  defaultValue: T
}

export const synced = async <T>({key, storage, defaultValue}: SyncedConfig<T>) => {
  const store = writable<T>(defaultValue)

  await sync({key, store, storage})

  return store
}
