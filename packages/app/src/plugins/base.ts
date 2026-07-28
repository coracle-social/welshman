import Fuse from "fuse.js"
import type {IFuseOptions, FuseResult} from "fuse.js"
import {writable, derived} from "svelte/store"
import type {Readable, Unsubscriber} from "svelte/store"
import {sortBy} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import type {Filter} from "@welshman/util"
import {
  deriveItems,
  deriveItemsByKey,
  deriveItemsByKeyByUrl,
  getter,
  makeDeriveItem,
  makeLoadItem,
  makeForceLoadItem,
} from "@welshman/store"
import type {EventToItem, ItemsByKey, MakeLoadItemOptions} from "@welshman/store"
import type {IApp} from "../app.js"

/**
 * Utility type which allows for using the same value both for hot gets and derived subscriptions
 */
export type Projection<T> = {
  get: () => T
  $: Readable<T>
}

export type SearchOptions<V, T> = {
  getValue: (item: T) => V
  fuseOptions?: IFuseOptions<T>
  onSearch?: (term: string) => void
  sortFn?: (items: FuseResult<T>) => any
}

export type Search<V, T> = {
  options: T[]
  getValue: (item: T) => V
  getOption: (value: V) => T | undefined
  searchOptions: (term: string) => T[]
  searchValues: (term: string) => V[]
}

/**
 * A reusable fuzzy-search primitive over a fixed list of `options`. Plugins that
 * expose a search (profiles, topics, relays) build one of these reactively from
 * their collection. Blends fuse scoring with an optional `sortFn`.
 */
export const createSearch = <V, T>(options: T[], opts: SearchOptions<V, T>): Search<V, T> => {
  const fuse = new Fuse(options, {...opts.fuseOptions, includeScore: true})
  const map = new Map<V, T>(options.map(item => [opts.getValue(item), item]))

  const search = (term: string) => {
    opts.onSearch?.(term)

    let results = term ? fuse.search(term) : options.map(item => ({item}) as FuseResult<T>)

    if (opts.sortFn) {
      results = sortBy(opts.sortFn, results)
    }

    return results.map(result => result.item)
  }

  return {
    options,
    getValue: opts.getValue,
    getOption: (value: V) => map.get(value),
    searchOptions: (term: string) => search(term),
    searchValues: (term: string) => search(term).map(opts.getValue),
  }
}

export const projection = <T>($: Readable<T>, get = getter($)) => ({$, get})

/**
 * Build a `Projection` derived from another `Projection`: re-read `src`
 * reactively via `.$` or synchronously via `.get()`.
 */
export const projectFrom = <S, U>(src: Projection<S>, read: ($: S) => U): Projection<U> =>
  projection(derived(src.$, read), () => read(src.get()))

/**
 * Base class for a reactive, keyed collection of "local" (non-event) data —
 * things like relay stats or NIP-11 profiles that aren't backed by the
 * repository. The collection owns its own map.
 *
 * `index` (map) and `all` (values) are `Projection`s — subscribe via `.$`,
 * snapshot via `.get()`. Per-key access is `one(key)`, a plain on-demand store
 * (snapshot with svelte's `get(...)`, or read `get(key)` directly).
 */
export class MapPlugin<T> {
  protected store = writable(new Map<string, T>())
  index: Projection<ItemsByKey<T>>
  all: Projection<T[]>
  one: (key?: string, ...args: any[]) => Readable<Maybe<T>>
  subs: ((key: string, value: Maybe<T>) => void)[] = []

  constructor(protected readonly app: IApp) {
    this.index = projection(this.store)
    this.all = projection(deriveItems(this.store))
    this.one = makeDeriveItem(this.store)
  }

  get = (key: string) => this.index.get().get(key)

  project = <U>(key: string, read: (item: Maybe<T>) => U): Projection<U> =>
    projection(derived(this.one(key), read), () => read(this.get(key)))

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
 * A `MapPlugin` collection that knows how to lazily load items by key from the
 * network. Subclasses implement `fetch`; `load`/`forceLoad`/`one` are derived
 * from it (with per-key caching and backoff via `makeLoadItem`).
 */
export abstract class LoadableMapPlugin<T> extends MapPlugin<T> {
  load: (key: string, ...args: any[]) => Promise<Maybe<T>>
  forceLoad: (key: string, ...args: any[]) => Promise<Maybe<T>>

  abstract fetch(key: string, ...args: any[]): Promise<unknown>

  constructor(app: IApp, options: MakeLoadItemOptions = {}) {
    super(app)

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

export type DerivedPluginOptions<T> = {
  filters: Filter[]
  eventToItem: EventToItem<T>
  getKey: (item: T) => string
  loadOptions?: MakeLoadItemOptions
}

/**
 * Base class for a reactive, keyed collection of data derived from nostr events.
 * The repository is the single source of truth — the collection is a live view
 * over `app.itemsByKey`, never a duplicated map. Subclasses implement `fetch`
 * (how to load an item by key from the network) and pass the filters/decoder via
 * `super`.
 *
 * `index` (map) and `all` (values) are `Projection`s — subscribe via `.$`,
 * snapshot via `.get()`. Per-key access is `one(key)`, a plain on-demand store.
 */
export abstract class DerivedPlugin<T> {
  index: Projection<ItemsByKey<T>>
  all: Projection<T[]>
  one: (key?: string, ...args: any[]) => Readable<Maybe<T>>
  load: (key: string, ...args: any[]) => Promise<Maybe<T>>
  forceLoad: (key: string, ...args: any[]) => Promise<Maybe<T>>

  abstract fetch(key: string, ...args: any[]): Promise<unknown>

  constructor(
    protected readonly app: IApp,
    options: DerivedPluginOptions<T>,
  ) {
    const index = deriveItemsByKey<T>({
      filters: options.filters,
      eventToItem: options.eventToItem,
      getKey: options.getKey,
      repository: app.repository,
    })

    this.index = projection(index)
    this.all = projection(deriveItems(index))

    const fetch = (key: string, ...args: any[]) => this.fetch(key, ...args)
    const read = (key: string) => this.index.get().get(key)

    this.load = makeLoadItem(fetch, read, options.loadOptions)
    this.forceLoad = makeForceLoadItem(fetch, read)
    this.one = makeDeriveItem(index, this.load)
  }

  get = (key: string) => this.index.get().get(key)

  project = <U>(key: string, read: (item: Maybe<T>) => U): Projection<U> =>
    projection(derived(this.one(key), read), () => read(this.get(key)))
}

export type RelayScopedDerivedPluginOptions<T> = {
  filters: Filter[]
  eventToItem: EventToItem<T>
  // Return `undefined` to exclude an item on a relay (e.g. it fails validation).
  getKey: (item: T, url: string) => string | undefined
  loadOptions?: MakeLoadItemOptions
  // Re-evaluate keys when this store changes — for keys that depend on state
  // that can settle after the events (see `RelaySignedDerivedPlugin`).
  revalidateOn?: Readable<unknown>
}

/**
 * A `DerivedPlugin` for relay-dependent data: each item is keyed by
 * `getKey(item, url)` once per relay it was seen on (via the tracker), so the
 * same addressable coordinate on two relays stays two distinct entries. Use it
 * for collections that only make sense relative to a relay — NIP-29 rooms
 * (`${url}'${room}`), relay roles (`${url}|${d}`), per-relay replaceables
 * (`${url}`). Subclasses implement `fetch` (loading from the relevant relay).
 */
export abstract class RelayScopedDerivedPlugin<T> {
  index: Projection<ItemsByKey<T>>
  all: Projection<T[]>
  one: (key?: string, ...args: any[]) => Readable<Maybe<T>>
  load: (key: string, ...args: any[]) => Promise<Maybe<T>>
  forceLoad: (key: string, ...args: any[]) => Promise<Maybe<T>>

  abstract fetch(key: string, ...args: any[]): Promise<unknown>

  constructor(
    protected readonly app: IApp,
    options: RelayScopedDerivedPluginOptions<T>,
  ) {
    const index = deriveItemsByKeyByUrl<T>({
      filters: options.filters,
      eventToItem: options.eventToItem,
      getKey: options.getKey,
      revalidateOn: options.revalidateOn,
      tracker: app.tracker,
      repository: app.repository,
    })

    this.index = projection(index)
    this.all = projection(deriveItems(index))

    const fetch = (key: string, ...args: any[]) => this.fetch(key, ...args)
    const read = (key: string) => this.index.get().get(key)

    this.load = makeLoadItem(fetch, read, options.loadOptions)
    this.forceLoad = makeForceLoadItem(fetch, read)
    this.one = makeDeriveItem(index, this.load)
  }

  get = (key: string) => this.index.get().get(key)

  project = <U>(key: string, read: (item: Maybe<T>) => U): Projection<U> =>
    projection(derived(this.one(key), read), () => read(this.get(key)))
}
