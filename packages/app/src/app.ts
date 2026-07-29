import type {Unsubscriber} from "svelte/store"
import {call} from "@welshman/lib"
import {Pool, Tracker, Repository, WrapManager} from "@welshman/net"
import type {NetContext, AdapterFactory} from "@welshman/net"
import type {User} from "./user.js"
import type {AppPolicy} from "./policy.js"

export type AppConfig = {
  dufflepudUrl?: string
  getDefaultRelays?: () => string[]
  getIndexerRelays?: () => string[]
  getSearchRelays?: () => string[]
}

export type AppOptions = {
  user?: User
  config?: AppConfig
  getAdapter?: AdapterFactory
  policies?: AppPolicy[]
}

export type PluginCtor<T = unknown> = new (app: IApp) => T

export interface IApp {
  user?: User
  config: AppConfig
  use: <T>(Ctor: PluginCtor<T>) => T
  onCleanup: (unsubscriber: Unsubscriber) => void
  netContext: NetContext
  pool: Pool
  tracker: Tracker
  repository: Repository
  wrapManager: WrapManager
}

/**
 * The core of an application instance. Owns the primitives a single identity
 * needs (so data never bleeds across sessions) — a private repository, a socket
 * pool, a tracker, a wrap manager — and a `use` registry that resolves data
 * modules (including net/store helpers) on demand.
 */
export class App implements IApp {
  user?: User
  config: AppConfig
  netContext: NetContext
  pool: Pool
  tracker: Tracker
  repository: Repository
  wrapManager: WrapManager

  private singletons = new Map<PluginCtor, unknown>()
  private unsubscribers: Unsubscriber[] = []

  constructor(options: AppOptions = {}) {
    this.user = options.user
    this.config = options.config ?? {}
    this.pool = new Pool()
    this.tracker = new Tracker()
    this.repository = new Repository()
    this.wrapManager = new WrapManager({
      tracker: this.tracker,
      repository: this.repository,
    })
    this.netContext = {
      pool: this.pool,
      repository: this.repository,
      getAdapter: options.getAdapter,
    }

    for (const policy of options.policies ?? []) {
      this.onCleanup(policy(this))
    }
  }

  use = <T>(Ctor: PluginCtor<T>): T => {
    let instance = this.singletons.get(Ctor) as T | undefined

    if (!instance) {
      this.singletons.set(Ctor, (instance = new Ctor(this)))
    }

    return instance
  }

  onCleanup = (unsubscriber: Unsubscriber) => {
    this.unsubscribers.push(unsubscriber)
  }

  cleanup() {
    // Unwind in reverse, since some teardowns only compose LIFO
    this.unsubscribers.slice().reverse().forEach(call)

    this.pool.clear()
    this.tracker.clear()
    this.repository.clear()
    this.wrapManager.clear()
  }
}
