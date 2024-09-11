import {openDB, deleteDB} from "idb"
import type {IDBPDatabase} from "idb"
import {throttle} from "throttle-debounce"
import {writable} from "svelte/store"
import type {Unsubscriber, Writable} from "svelte/store"
import {randomInt, fromPairs} from "@welshman/lib"
import type {Tracker} from "@welshman/net"
import {withGetter, adapter, custom} from "@welshman/store"

export type Item = Record<string, any>

export type IndexedDbAdapter = {
  keyPath: string
  store: Writable<Item[]>
}

export let db: IDBPDatabase

export const dead = withGetter(writable(false))

export const subs: Unsubscriber[] = []

export const getAll = async (name: string) => {
  const tx = db.transaction(name, "readwrite")
  const store = tx.objectStore(name)
  const result = await store.getAll()

  await tx.done

  return result
}

export const bulkPut = async (name: string, data: any[]) => {
  const tx = db.transaction(name, "readwrite")
  const store = tx.objectStore(name)

  await Promise.all(data.map(item => store.put(item)))
  await tx.done
}

export const bulkDelete = async (name: string, ids: string[]) => {
  const tx = db.transaction(name, "readwrite")
  const store = tx.objectStore(name)

  await Promise.all(ids.map(id => store.delete(id)))
  await tx.done
}

export const initIndexedDbAdapter = async (name: string, adapter: IndexedDbAdapter) => {
  let prevRecords = await getAll(name)

  adapter.store.set(prevRecords)

  adapter.store.subscribe(
    throttle(randomInt(3000, 5000), async (newRecords: Item[]) => {
      if (dead.get()) {
        return
      }

      const currentIds = new Set(newRecords.map(item => item[adapter.keyPath]))
      const removedRecords = prevRecords.filter(r => !currentIds.has(r[adapter.keyPath]))

      prevRecords = newRecords

      if (newRecords.length > 0) {
        await bulkPut(name, newRecords)
      }

      if (removedRecords.length > 0) {
        await bulkDelete(
          name,
          removedRecords.map(item => item[adapter.keyPath]),
        )
      }
    }),
  )
}

export const initStorage = async (name: string, version: number, adapters: Record<string, IndexedDbAdapter>) => {
  if (!window.indexedDB) return

  window.addEventListener("beforeunload", () => closeStorage())

  if (db) {
    throw new Error("Db initialized multiple times")
  }

  db = await openDB(name, version, {
    upgrade(db: IDBPDatabase) {
      const names = Object.keys(adapters)

      for (const name of db.objectStoreNames) {
        if (!names.includes(name)) {
          db.deleteObjectStore(name)
        }
      }

      for (const [name, {keyPath}] of Object.entries(adapters)) {
        try {
          db.createObjectStore(name, {keyPath})
        } catch (e) {
          console.warn(e)
        }
      }
    },
  })

  await Promise.all(
    Object.entries(adapters).map(([name, config]) => initIndexedDbAdapter(name, config)),
  )
}

export const closeStorage = async () => {
  dead.set(true)
  subs.forEach(unsub => unsub())
  await db?.close()
}

export const clearStorage = async () => {
  await closeStorage()
  await deleteDB(db.name)
}

export const storageAdapters = {
  fromObjectStore: <T>(store: Writable<Record<string, T>>) => ({
    keyPath: "key",
    store: adapter({
      store: store,
      forward: ($data: Record<string, T>) =>
        Object.entries($data).map(([key, value]) => ({key, value})),
      backward: (data: {key: string, value: T}[]) =>
        fromPairs(data.map(({key, value}) => [key, value])),
    }),
  }),
  fromMapStore: <T>(store: Writable<Map<string, T>>) => ({
    keyPath: "key",
    store: adapter({
      store: store,
      forward: ($data: Map<string, T>) =>
        Array.from($data.entries()).map(([key, value]) => ({key, value})),
      backward: (data: {key: string, value: T}[]) =>
        new Map(data.map(({key, value}) => [key, value])),
    }),
  }),
  fromTracker: (tracker: Tracker) => ({
    keyPath: 'key',
    store: custom(setter => {
      const onUpdate = () =>
        setter(
          Array.from(tracker.data.entries())
            .map(([key, urls]) => ({key, value: Array.from(urls)}))
        )

      onUpdate()
      tracker.on('update', onUpdate)

      return () => tracker.off('update', onUpdate)
    }, {
      set: (data: {key: string, value: string[]}[]) =>
        tracker.load(new Map(data.map(({key, value}) => [key, new Set(value)]))),
    }),
  }),
}
