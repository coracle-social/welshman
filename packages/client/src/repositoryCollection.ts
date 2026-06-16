import type {Readable} from "svelte/store"
import type {Maybe} from "@welshman/lib"
import type {Filter} from "@welshman/util"
import {deriveItems, getter, makeLoadItem, makeForceLoadItem, makeDeriveItem} from "@welshman/store"
import type {EventToItem, ItemsByKey, MakeLoadItemOptions} from "@welshman/store"
import type {ClientContext} from "./client.js"

export type RepositoryCollectionOptions<T> = {
  filters: Filter[]
  eventToItem: EventToItem<T>
  getKey: (item: T) => string
  loadOptions?: MakeLoadItemOptions
}

/**
 * Base class for a reactive, keyed collection of data derived from nostr events.
 * The repository is the single source of truth — the collection is a live view
 * over `ctx.deriveItemsByKey`, never a duplicated map. Subclasses implement
 * `fetch` (how to load an item by key from the network) and pass the
 * filters/decoder via `super`.
 *
 * Like `ClientData`, subclasses depend only on the `ClientContext` seam.
 */
export abstract class RepositoryCollection<T> {
  byKey: Readable<ItemsByKey<T>>
  all: Readable<T[]>
  subscribe: Readable<ItemsByKey<T>>["subscribe"]
  get: (key: string) => Maybe<T>
  getAll: () => T[]
  keys: () => IterableIterator<string>
  values: () => IterableIterator<T>
  load: (key: string, ...args: any[]) => Promise<Maybe<T>>
  forceLoad: (key: string, ...args: any[]) => Promise<Maybe<T>>
  // Reactive view of a single key that also triggers a load
  derive: (key?: string, ...args: any[]) => Readable<Maybe<T>>
  // Reactive view of a single key that does not trigger a load
  derived: (key?: string, ...args: any[]) => Readable<Maybe<T>>
  private getByKey: () => ItemsByKey<T>

  abstract fetch(key: string, ...args: any[]): Promise<unknown>

  constructor(
    protected readonly ctx: ClientContext,
    options: RepositoryCollectionOptions<T>,
  ) {
    const fetch = (key: string, ...args: any[]) => this.fetch(key, ...args)

    this.byKey = ctx.deriveItemsByKey<T>({
      filters: options.filters,
      eventToItem: options.eventToItem,
      getKey: options.getKey,
    })
    this.all = deriveItems(this.byKey)
    this.subscribe = this.byKey.subscribe
    this.getByKey = getter(this.byKey)
    this.getAll = getter(this.all)
    this.get = (key: string) => this.getByKey().get(key)
    this.keys = () => this.getByKey().keys()
    this.values = () => this.getByKey().values()
    this.load = makeLoadItem(fetch, this.get, options.loadOptions)
    this.forceLoad = makeForceLoadItem(fetch, this.get)
    this.derive = makeDeriveItem(this.byKey, this.load)
    this.derived = makeDeriveItem(this.byKey)
  }

  // Convenience views of the current user's own item (replaces the old
  // user.ts userProfile/userFollowList/etc. derived stores)

  getForUser = () => {
    const pubkey = this.ctx.user?.pubkey

    return pubkey ? this.get(pubkey) : undefined
  }

  deriveForUser = (...args: any[]) => this.derive(this.ctx.user?.pubkey, ...args)

  loadForUser = (...args: any[]) => {
    const pubkey = this.ctx.user?.pubkey

    return pubkey ? this.load(pubkey, ...args) : Promise.resolve(undefined)
  }

  forceLoadForUser = (...args: any[]) => {
    const pubkey = this.ctx.user?.pubkey

    return pubkey ? this.forceLoad(pubkey, ...args) : Promise.resolve(undefined)
  }
}
