import {openDB, deleteDB} from "idb"
import type {IDBPDatabase} from "idb"
import {writable} from "svelte/store"
import type {Unsubscriber, Writable} from "svelte/store"
import {indexBy, equals, throttle, fromPairs} from "@welshman/lib"
import type {TrustedEvent, Repository} from "@welshman/util"
import type {Tracker} from "@welshman/net"
import {withGetter, adapter, throttled, custom} from "@welshman/store"

export type StorageAdapterOptions = {
  throttle?: number
  migrate?: (items: any[]) => any[]
}

export type StorageAdapter = {
  keyPath: string
  store: Writable<any[]>
  options: StorageAdapterOptions
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
  const tx = db.transaction(name, "readwrite")
  const store = tx.objectStore(name)

  await Promise.all(ids.map(id => store.delete(id)))
  await tx.done
}

export const initIndexedDbAdapter = async (name: string, adapter: StorageAdapter) => {
  let prevRecords = await getAll(name)

  adapter.store.set(prevRecords)

  setTimeout(() => {
    adapter.store.subscribe(async (currentRecords: any[]) => {
      if (dead.get()) {
        return
      }

      const currentIds = new Set(currentRecords.map(item => item[adapter.keyPath]))
      const removedRecords = prevRecords.filter(r => !currentIds.has(r[adapter.keyPath]))

      const prevRecordsById = indexBy(item => item[adapter.keyPath], prevRecords)
      const updatedRecords = currentRecords.filter(
        r => !equals(r, prevRecordsById.get(r[adapter.keyPath])),
      )

      prevRecords = currentRecords

      if (updatedRecords.length > 0) {
        await bulkPut(name, updatedRecords)
      }

      if (removedRecords.length > 0) {
        await bulkDelete(
          name,
          removedRecords.map(item => item[adapter.keyPath]),
        )
      }
    })
  }, adapter.options.throttle || 0)
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

const migrate = (data: any[], options: StorageAdapterOptions) =>
  options.migrate ? options.migrate(data) : data

export const storageAdapters = {
  fromCollectionStore: <T>(
    keyPath: string,
    store: Writable<T[]>,
    options: StorageAdapterOptions = {},
  ) => ({
    options,
    keyPath,
    store: throttled(options.throttle || 0, store),
  }),
  fromObjectStore: <T>(
    store: Writable<Record<string, T>>,
    options: StorageAdapterOptions = {},
  ) => ({
    options,
    keyPath: "key",
    store: adapter({
      store: throttled(options.throttle || 0, store),
      forward: (data: Record<string, T>) =>
        migrate(
          Object.entries(data).map(([key, value]) => ({key, value})),
          options,
        ),
      backward: (data: {key: string; value: T}[]) =>
        fromPairs(data.map(({key, value}) => [key, value])),
    }),
  }),
  fromMapStore: <T>(store: Writable<Map<string, T>>, options: StorageAdapterOptions = {}) => ({
    options,
    keyPath: "key",
    store: adapter({
      store: throttled(options.throttle || 0, store),
      forward: (data: Map<string, T>) =>
        migrate(
          Array.from(data.entries()).map(([key, value]) => ({key, value})),
          options,
        ),
      backward: (data: {key: string; value: T}[]) =>
        new Map(data.map(({key, value}) => [key, value])),
    }),
  }),
  fromTracker: (tracker: Tracker, options: StorageAdapterOptions = {}) => ({
    options,
    keyPath: "key",
    store: custom(
      setter => {
        let onUpdate = () =>
          setter(
            migrate(
              Array.from(tracker.relaysById.entries()).map(([key, urls]) => ({
                key,
                value: Array.from(urls),
              })),
              options,
            ),
          )

        if (options.throttle) {
          onUpdate = throttle(options.throttle, onUpdate)
        }

        onUpdate()
        tracker.on("update", onUpdate)

        return () => tracker.off("update", onUpdate)
      },
      {
        set: (data: {key: string; value: string[]}[]) =>
          tracker.load(new Map(data.map(({key, value}) => [key, new Set(value)]))),
      },
    ),
  }),
  fromRepository: (repository: Repository, options: StorageAdapterOptions = {}) => ({
    options,
    keyPath: "id",
    store: custom(
      setter => {
        let onUpdate = () => setter(migrate(repository.dump(), options))

        if (options.throttle) {
          onUpdate = throttle(options.throttle, onUpdate)
        }

        onUpdate()
        repository.on("update", onUpdate)

        return () => repository.off("update", onUpdate)
      },
      {
        set: (events: TrustedEvent[]) => repository.load(events),
      },
    ),
  }),
  fromRepositoryAndTracker: (
    repository: Repository,
    tracker: Tracker,
    options: StorageAdapterOptions = {},
  ) => ({
    options,
    keyPath: "id",
    store: custom(
      setter => {
        let onUpdate = () => {
          const events = migrate(repository.dump(), options)

          setter(
            events.map(event => {
              const relays = Array.from(tracker.getRelays(event.id))

              return {id: event.id, event, relays}
            }),
          )
        }

        if (options.throttle) {
          onUpdate = throttle(options.throttle, onUpdate)
        }

        onUpdate()
        tracker.on("update", onUpdate)
        repository.on("update", onUpdate)

        return () => {
          tracker.off("update", onUpdate)
        }
      },
      {
        set: (items: {event: TrustedEvent; relays: string[]}[]) => {
          const events: TrustedEvent[] = []
          const relaysById = new Map<string, Set<string>>()

          for (const {event, relays} of items) {
            events.push(event)
            relaysById.set(event.id, new Set(relays))
          }

          repository.load(events)
          tracker.load(relaysById)
        },
      },
    ),
  }),
}
