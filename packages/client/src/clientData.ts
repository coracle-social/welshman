import {writable} from "svelte/store"
import type {Readable, Unsubscriber} from "svelte/store"
import type {Maybe} from "@welshman/lib"
import {getter, makeDeriveItem, makeLoadItem, makeForceLoadItem} from "@welshman/store"
import type {MakeLoadItemOptions} from "@welshman/store"
import type {ClientContext} from "./client.js"

/**
 * Base class for a reactive, keyed collection of "local" (non-event) data —
 * things like relay stats or NIP-11 profiles that aren't backed by the
 * repository. The collection owns its own map and is its own Svelte store: its
 * `subscribe` emits the underlying `Map`.
 *
 * Subclasses reach the client through the `ClientContext` seam, never the
 * concrete `Client`, so they never create a dependency cycle.
 */
export class ClientData<T> {
  protected index = writable(new Map<string, T>())
  protected getIndex = getter(this.index)
  protected itemSubscribers: ((key: string, value: Maybe<T>) => void)[] = []
  public derive: (key?: string, ...args: any[]) => Readable<Maybe<T>>

  constructor(protected readonly ctx: ClientContext) {
    this.derive = makeDeriveItem(this.index)
  }

  subscribe = this.index.subscribe

  get = (key: string): Maybe<T> => this.getIndex().get(key)

  getAll = (): T[] => Array.from(this.getIndex().values())

  keys = () => this.getIndex().keys()

  values = () => this.getIndex().values()

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
    const keys = Array.from(this.getIndex().keys())

    this.index.set(new Map())

    for (const key of keys) {
      this.emitItem(key, undefined)
    }
  }

  onItem = (subscriber: (key: string, value: Maybe<T>) => void): Unsubscriber => {
    this.itemSubscribers.push(subscriber)

    return () => {
      const i = this.itemSubscribers.indexOf(subscriber)

      if (i !== -1) this.itemSubscribers.splice(i, 1)
    }
  }

  protected emitItem = (key: string, value: Maybe<T>) => {
    for (const subscriber of this.itemSubscribers) {
      subscriber(key, value)
    }
  }
}

/**
 * A `ClientData` collection that knows how to lazily load items by key from the
 * network. Subclasses implement `fetch`; `load`/`forceLoad`/`derive` are derived
 * from it (with per-key caching and backoff via `makeLoadItem`).
 */
export abstract class LoadableData<T> extends ClientData<T> {
  load: (key: string, ...args: any[]) => Promise<Maybe<T>>
  forceLoad: (key: string, ...args: any[]) => Promise<Maybe<T>>

  abstract fetch(key: string, ...args: any[]): Promise<unknown>

  constructor(ctx: ClientContext, options: MakeLoadItemOptions = {}) {
    super(ctx)

    // Subclasses implement `fetch` as an arrow field, whose initializer runs
    // *after* super() — so `this.fetch` is undefined here. makeLoadItem captures
    // its loadItem eagerly, so we defer the lookup to call time via this wrapper.
    const fetch = (key: string, ...args: any[]) => this.fetch(key, ...args)

    this.load = makeLoadItem(fetch, this.get, options)
    this.forceLoad = makeForceLoadItem(fetch, this.get)
    this.derive = makeDeriveItem(this.index, this.load)
  }
}
