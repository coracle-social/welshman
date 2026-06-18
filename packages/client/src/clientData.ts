import {writable} from "svelte/store"
import type {Readable, Unsubscriber} from "svelte/store"
import type {Maybe} from "@welshman/lib"
import type {Filter} from "@welshman/util"
import {deriveItems, withGetter, makeDeriveItem, makeLoadItem, makeForceLoadItem} from "@welshman/store"
import type {
  ReadableWithGetter,
  EventToItem,
  ItemsByKey,
  MakeLoadItemOptions,
} from "@welshman/store"
import type {IClient} from "./client.js"
import {Stores} from "./stores.js"

/**
 * Base class for a reactive, keyed collection of "local" (non-event) data —
 * things like relay stats or NIP-11 profiles that aren't backed by the
 * repository. The collection owns its own map.
 */
export class ClientData<T> {
  index = withGetter(writable(new Map<string, T>()))
  all = withGetter(deriveItems(this.index))
  one: (key?: string, ...args: any[]) => Readable<Maybe<T>>
  subs: ((key: string, value: Maybe<T>) => void)[] = []

  constructor(protected readonly ctx: IClient) {
    this.one = makeDeriveItem(this.index)
  }

  keys = () => this.index.get().keys()

  values = () => this.index.get().values()

  get = (key: string) => this.index.get().get(key)

  set = (key: string, value: T) => {
    this.index.update($items => {
      $items.set(key, value)

      return $items
    })

    this.emitItem(key, value)
  }

  delete = (key: string) => {
    this.index.update($items => {
      $items.delete(key)

      return $items
    })

    this.emitItem(key, undefined)
  }

  clear = () => {
    const keys = Array.from(this.index.get().keys())

    this.index.set(new Map())

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
    this.one = makeDeriveItem(this.index, this.load)
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
 */
export abstract class DerivedData<T> {
  index: ReadableWithGetter<ItemsByKey<T>>
  all: ReadableWithGetter<T[]>
  one: (key?: string, ...args: any[]) => Readable<Maybe<T>>
  load: (key: string, ...args: any[]) => Promise<Maybe<T>>
  forceLoad: (key: string, ...args: any[]) => Promise<Maybe<T>>

  abstract fetch(key: string, ...args: any[]): Promise<unknown>

  constructor(
    protected readonly ctx: IClient,
    options: DerivedDataOptions<T>,
  ) {
    this.index = withGetter(
      ctx.use(Stores).itemsByKey<T>({
        filters: options.filters,
        eventToItem: options.eventToItem,
        getKey: options.getKey,
      }),
    )
    this.all = withGetter(deriveItems(this.index))

    const fetch = (key: string, ...args: any[]) => this.fetch(key, ...args)
    const read = (key: string) => this.index.get().get(key)

    this.load = makeLoadItem(fetch, read, options.loadOptions)
    this.forceLoad = makeForceLoadItem(fetch, read)
    this.one = makeDeriveItem(this.index, this.load)
  }

  keys = () => this.index.get().keys()

  values = () => this.index.get().values()

  get = (key: string) => this.index.get().get(key)
}
