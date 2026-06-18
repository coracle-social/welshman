import type {Unsubscriber} from "svelte/store"
import {call} from "@welshman/lib"
import {Pool, Tracker, Repository, WrapManager} from "@welshman/net"
import type {NetContext, AdapterFactory} from "@welshman/net"
import type {User} from "./user.js"
import type {ClientPolicy} from "./policy.js"

export type ClientConfig = {
  dufflepudUrl?: string
  getDefaultRelays?: () => string[]
  getIndexerRelays?: () => string[]
  getSearchRelays?: () => string[]
}

export type ClientOptions = {
  user?: User
  config?: ClientConfig
  getAdapter?: AdapterFactory
  policies?: ClientPolicy[]
}

export interface IClient {
  user?: User
  config: ClientConfig
  use: <T>(Ctor: new (ctx: IClient) => T) => T
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
export class Client implements IClient {
  user?: User
  config: ClientConfig
  netContext: NetContext
  pool: Pool
  tracker: Tracker
  repository: Repository
  wrapManager: WrapManager

  private singletons = new Map<Function, unknown>()
  private unsubscribers: Unsubscriber[] = []

  constructor(options: ClientOptions = {}) {
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
      this.unsubscribers.push(policy(this))
    }
  }

  // Resolve the per-client singleton of a data module, constructing it on first
  // use. This is how modules reach their dependencies (e.g. ctx.use(RelayLists)),
  // replacing constructor injection and letting cycles resolve lazily.
  use = <T>(Ctor: new (ctx: IClient) => T): T => {
    let instance = this.singletons.get(Ctor) as T | undefined

    if (!instance) {
      this.singletons.set(Ctor, (instance = new Ctor(this)))
    }

    return instance
  }

  cleanup() {
    this.unsubscribers.forEach(call)
    this.pool.clear()
    this.tracker.clear()
    this.repository.clear()
    this.wrapManager.clear()
  }
}
