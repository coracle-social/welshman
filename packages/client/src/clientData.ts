import {writable} from "svelte/store"
import type {Readable, Unsubscriber} from "svelte/store"
import type {Maybe} from "@welshman/lib"
import type {Filter} from "@welshman/util"
import {deriveItems, getter, makeDeriveItem, makeLoadItem, makeForceLoadItem} from "@welshman/store"
import type {EventToItem, ItemsByKey, MakeLoadItemOptions} from "@welshman/store"
import type {IClient} from "./client.js"
import {Stores} from "./stores.js"

/**
 * Utility type which allows for using the same value both for hot gets and derived subscriptions
 */
export type Projection<T> = {
  get: () => T
  $: Readable<T>
}

export const projection = <T>($: Readable<T>, get = getter($)) => ({$, get})

/**
 * Base class for a reactive, keyed collection of "local" (non-event) data —
 * things like relay stats or NIP-11 profiles that aren't backed by the
 * repository. The collection owns its own map.
 *
 * `index` (map) and `all` (values) are `Projection`s — subscribe via `.$`,
 * snapshot via `.get()`. Per-key access is `one(key)`, a plain on-demand store
 * (snapshot with svelte's `get(...)`, or read `get(key)` directly).
 */
export class ClientData<T> {
  protected store = writable(new Map<string, T>())
  index: Projection<ItemsByKey<T>>
  all: Projection<T[]>
  one: (key?: string, ...args: any[]) => Readable<Maybe<T>>
  subs: ((key: string, value: Maybe<T>) => void)[] = []

  constructor(protected readonly ctx: IClient) {
    this.index = projection(this.store)
    this.all = projection(deriveItems(this.store))
    this.one = makeDeriveItem(this.store)
  }

  keys = () => this.index.get().keys()

  values = () => this.index.get().values()

  get = (key: string) => this.index.get().get(key)

  set = (key: string, value: T) => {
    this.store.update($items => {
      $items.set(key, value)

      return $items
    })

    this.emitItem(key, value)
  }

  delete = (key: string) => {
    this.store.update($items => {
      $items.delete(key)

      return $items
    })

    this.emitItem(key, undefined)
  }

  clear = () => {
    const keys = Array.from(this.index.get().keys())

    this.store.set(new Map())

    for (const key of keys) {
      this.emitItem(key, undefined)
    }
  }

  onItem = (subscriber: (key: string, value: Maybe<T>) => void): Unsubscriber => {
    this.subs.push(subscriber)

    return () => {
      const i = this.subs.indexOf(subscriber)

      if (i !== -1) this.subs.splice(i, 1)
    }
  }

  protected emitItem = (key: string, value: Maybe<T>) => {
    for (const subscriber of this.subs) {
      subscriber(key, value)
    }
  }
}

/**
 * A `ClientData` collection that knows how to lazily load items by key from the
 * network. Subclasses implement `fetch`; `load`/`forceLoad`/`one` are derived
 * from it (with per-key caching and backoff via `makeLoadItem`).
 */
export abstract class LoadableData<T> extends ClientData<T> {
  load: (key: string, ...args: any[]) => Promise<Maybe<T>>
  forceLoad: (key: string, ...args: any[]) => Promise<Maybe<T>>

  abstract fetch(key: string, ...args: any[]): Promise<unknown>

  constructor(ctx: IClient, options: MakeLoadItemOptions = {}) {
    super(ctx)

    // Subclasses implement `fetch` as an arrow field, whose initializer runs
    // *after* super() — so `this.fetch` is undefined here. makeLoadItem captures
    // its loadItem eagerly, so we defer the lookup to call time via this wrapper.
    const fetch = (key: string, ...args: any[]) => this.fetch(key, ...args)
    const read = (key: string) => this.index.get().get(key)

    this.load = makeLoadItem(fetch, read, options)
    this.forceLoad = makeForceLoadItem(fetch, read)
    this.one = makeDeriveItem(this.store, this.load)
  }
}

export type DerivedDataOptions<T> = {
  filters: Filter[]
  eventToItem: EventToItem<T>
  getKey: (item: T) => string
  loadOptions?: MakeLoadItemOptions
}

/**
 * Base class for a reactive, keyed collection of data derived from nostr events.
 * The repository is the single source of truth — the collection is a live view
 * over `ctx.itemsByKey`, never a duplicated map. Subclasses implement `fetch`
 * (how to load an item by key from the network) and pass the filters/decoder via
 * `super`.
 *
 * `index` (map) and `all` (values) are `Projection`s — subscribe via `.$`,
 * snapshot via `.get()`. Per-key access is `one(key)`, a plain on-demand store.
 */
export abstract class DerivedData<T> {
  index: Projection<ItemsByKey<T>>
  all: Projection<T[]>
  one: (key?: string, ...args: any[]) => Readable<Maybe<T>>
  load: (key: string, ...args: any[]) => Promise<Maybe<T>>
  forceLoad: (key: string, ...args: any[]) => Promise<Maybe<T>>

  abstract fetch(key: string, ...args: any[]): Promise<unknown>

  constructor(
    protected readonly ctx: IClient,
    options: DerivedDataOptions<T>,
  ) {
    const index = ctx.use(Stores).itemsByKey<T>({
      filters: options.filters,
      eventToItem: options.eventToItem,
      getKey: options.getKey,
    })

    this.index = projection(index)
    this.all = projection(deriveItems(index))

    const fetch = (key: string, ...args: any[]) => this.fetch(key, ...args)
    const read = (key: string) => this.index.get().get(key)

    this.load = makeLoadItem(fetch, read, options.loadOptions)
    this.forceLoad = makeForceLoadItem(fetch, read)
    this.one = makeDeriveItem(index, this.load)
  }

  keys = () => this.index.get().keys()

  values = () => this.index.get().values()

  get = (key: string) => this.index.get().get(key)
}
