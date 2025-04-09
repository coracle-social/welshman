import {openDB, deleteDB} from "idb"
import {IDBPDatabase} from "idb"
import {writable} from "svelte/store"
import {Unsubscriber} from "svelte/store"
import {call, defer} from "@welshman/lib"
import {withGetter} from "@welshman/store"

export type StorageAdapterOptions = {
  throttle?: number
  migrate?: (items: any[]) => any[]
}

export type StorageAdapter = {
  keyPath: string
  init: () => Promise<void>
  sync: () => Unsubscriber
}

export let db: IDBPDatabase | undefined

export const ready = defer<void>()

export const dead = withGetter(writable(false))

export const subs: Unsubscriber[] = []

export const getAll = async (name: string) => {
  await ready

  const tx = db!.transaction(name, "readwrite")
  const store = tx.objectStore(name)
  const result = await store.getAll()

  await tx.done

  return result
}

export const bulkPut = async (name: string, data: any[]) => {
  await ready

  const tx = db!.transaction(name, "readwrite")
  const store = tx.objectStore(name)

  await Promise.all(
    data.map(item => {
      try {
        store.put(item)
      } catch (e) {
        console.error(e, item)
      }
    }),
  )

  await tx.done
}

export const bulkDelete = async (name: string, ids: string[]) => {
  await ready

  const tx = db!.transaction(name, "readwrite")
  const store = tx.objectStore(name)

  await Promise.all(ids.map(id => store.delete(id)))
  await tx.done
}

export const initStorage = async (
  name: string,
  version: number,
  adapters: Record<string, StorageAdapter>,
) => {
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

  ready.resolve()

  await Promise.all(Object.values(adapters).map(adapter => adapter.init()))

  const unsubscribers = Object.values(adapters).map(adapter => adapter.sync())

  return () => unsubscribers.forEach(call)
}

export const closeStorage = async () => {
  dead.set(true)
  subs.forEach(unsub => unsub())
  await db?.close()
}

export const clearStorage = async () => {
  if (db) {
    await closeStorage()
    await deleteDB(db.name)
    db = undefined // force initStorage to run again in tests
  }
}
