import type {Readable, Unsubscriber} from "svelte/store"
import {isDVMKind, isEphemeralKind} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {
  Pool,
  Socket,
  SocketEvent,
  Tracker,
  Repository,
  WrapManager,
  defaultSocketPolicies,
  netContext,
  isRelayEvent,
  request,
  publish,
  diff,
  pull,
  push,
  makeLoader,
} from "@welshman/net"
import type {
  AdapterContext,
  AdapterFactory,
  SocketPolicy,
  RelayMessage,
  Loader,
  LoaderOptions,
  RequestOptions,
  PublishOptions,
  DiffOptions,
  PullOptions,
  PushOptions,
} from "@welshman/net"
import {
  getEventsById,
  deriveEventsById,
  deriveEvents,
  makeDeriveEvent,
  getEventsByIdByUrl,
  deriveEventsByIdByUrl,
  getEventsByIdForUrl,
  deriveEventsByIdForUrl,
  deriveItemsByKey,
  deriveIsDeleted,
} from "@welshman/store"
import type {
  EventsByIdOptions,
  EventOptions,
  EventsByIdByUrlOptions,
  EventsByIdForUrlOptions,
  ItemsByKey,
  ItemsByKeyOptions,
} from "@welshman/store"
import type {User} from "./user.js"

export type ClientOptions = {
  user?: User
  getAdapter?: AdapterFactory
  socketPolicies?: SocketPolicy[]
}

/**
 * The narrow seam that data modules (plugins) depend on instead of the concrete
 * `Client`. Because plugins reference only `ClientContext`, the client never
 * imports them and they never create a dependency cycle back to the client —
 * the dependency is strictly one-way (plugin -> context).
 *
 * `Client implements ClientContext`, so the two stay in sync by construction.
 */
export interface ClientContext {
  user?: User
  pool: Pool
  tracker: Tracker
  repository: Repository
  wrapManager: WrapManager

  // Net utilities, with this client's context baked in
  request: (options: Omit<RequestOptions, "context">) => ReturnType<typeof request>
  publish: (options: Omit<PublishOptions, "context">) => ReturnType<typeof publish>
  diff: (options: Omit<DiffOptions, "context">) => ReturnType<typeof diff>
  pull: (options: Omit<PullOptions, "context">) => ReturnType<typeof pull>
  push: (options: Omit<PushOptions, "context">) => ReturnType<typeof push>
  makeLoader: (options: Omit<LoaderOptions, "context">) => Loader
  load: Loader

  // Store utilities, with this client's repository/tracker baked in
  getEventsById: (options: Omit<EventsByIdOptions, "repository">) => ReturnType<typeof getEventsById>
  deriveEventsById: (
    options: Omit<EventsByIdOptions, "repository">,
  ) => ReturnType<typeof deriveEventsById>
  deriveEvents: (options: Omit<EventsByIdOptions, "repository">) => ReturnType<typeof deriveEvents>
  makeDeriveEvent: (options: Omit<EventOptions, "repository">) => ReturnType<typeof makeDeriveEvent>
  getEventsByIdByUrl: (
    options: Omit<EventsByIdByUrlOptions, "tracker" | "repository">,
  ) => ReturnType<typeof getEventsByIdByUrl>
  deriveEventsByIdByUrl: (
    options: Omit<EventsByIdByUrlOptions, "tracker" | "repository">,
  ) => ReturnType<typeof deriveEventsByIdByUrl>
  getEventsByIdForUrl: (
    options: Omit<EventsByIdForUrlOptions, "tracker" | "repository">,
  ) => ReturnType<typeof getEventsByIdForUrl>
  deriveEventsByIdForUrl: (
    options: Omit<EventsByIdForUrlOptions, "tracker" | "repository">,
  ) => ReturnType<typeof deriveEventsByIdForUrl>
  deriveItemsByKey: <T>(options: Omit<ItemsByKeyOptions<T>, "repository">) => Readable<ItemsByKey<T>>
  deriveIsDeleted: (event: TrustedEvent) => ReturnType<typeof deriveIsDeleted>
}

/**
 * The core of an application instance. Owns the primitives a single identity
 * needs (so data never bleeds across sessions) — a private repository, a socket
 * pool, a tracker, a wrap manager — plus net/store helpers bound to them.
 *
 * Data modules are NOT fields on the client; they are composed separately (see
 * `createApp`) and reach the client through the `ClientContext` seam.
 */
export class Client implements ClientContext {
  user?: User
  pool: Pool
  tracker: Tracker
  repository: Repository
  wrapManager: WrapManager
  netContext: AdapterContext
  load: Loader
  ingestCleanup: Unsubscriber

  constructor(options: ClientOptions = {}) {
    this.user = options.user
    this.pool = new Pool({
      makeSocket: (url: string) => {
        let socketPolicies = options.socketPolicies ?? defaultSocketPolicies

        if (this.user) {
          socketPolicies = [...socketPolicies, this.user.makeSocketPolicyAuth()]
        }

        return new Socket(url, socketPolicies)
      },
    })
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
    this.load = this.makeLoader({
      delay: 200,
      timeout: 3000,
      threshold: 0.5,
    })

    // Ingest every event received on any socket into this client's repository.
    // The net layer doesn't do this for us, and it's how all the repository-
    // backed collections (and gift-wrap unwrapping) get populated.
    this.ingestCleanup = this.pool.subscribe(socket => {
      const onReceive = (message: RelayMessage) => this.ingest(message, socket.url)

      socket.on(SocketEvent.Receive, onReceive)

      return () => socket.off(SocketEvent.Receive, onReceive)
    })
  }

  ingest = (message: RelayMessage, url: string) => {
    if (!isRelayEvent(message)) return

    const event = message[2]

    if (isDVMKind(event.kind) || isEphemeralKind(event.kind)) return
    if (!netContext.isEventValid(event, url)) return

    this.tracker.track(event.id, url)
    this.repository.publish(event)
  }

  cleanup() {
    this.ingestCleanup()
    this.pool.clear()
    this.tracker.clear()
    this.repository.clear()
    this.wrapManager.clear()
  }

  // Net utilities, bound to this client's context

  request = (options: Omit<RequestOptions, "context">) =>
    request({...options, context: this.netContext})

  publish = (options: Omit<PublishOptions, "context">) =>
    publish({...options, context: this.netContext})

  diff = (options: Omit<DiffOptions, "context">) => diff({...options, context: this.netContext})

  pull = (options: Omit<PullOptions, "context">) => pull({...options, context: this.netContext})

  push = (options: Omit<PushOptions, "context">) => push({...options, context: this.netContext})

  makeLoader = (options: Omit<LoaderOptions, "context">): Loader =>
    makeLoader({...options, context: this.netContext})

  // Store utilities, bound to this client's repository/tracker

  getEventsById = (options: Omit<EventsByIdOptions, "repository">) =>
    getEventsById({...options, repository: this.repository})

  deriveEventsById = (options: Omit<EventsByIdOptions, "repository">) =>
    deriveEventsById({...options, repository: this.repository})

  deriveEvents = (options: Omit<EventsByIdOptions, "repository">) =>
    deriveEvents({...options, repository: this.repository})

  makeDeriveEvent = (options: Omit<EventOptions, "repository">) =>
    makeDeriveEvent({...options, repository: this.repository})

  getEventsByIdByUrl = (options: Omit<EventsByIdByUrlOptions, "tracker" | "repository">) =>
    getEventsByIdByUrl({...options, tracker: this.tracker, repository: this.repository})

  deriveEventsByIdByUrl = (options: Omit<EventsByIdByUrlOptions, "tracker" | "repository">) =>
    deriveEventsByIdByUrl({...options, tracker: this.tracker, repository: this.repository})

  getEventsByIdForUrl = (options: Omit<EventsByIdForUrlOptions, "tracker" | "repository">) =>
    getEventsByIdForUrl({...options, tracker: this.tracker, repository: this.repository})

  deriveEventsByIdForUrl = (options: Omit<EventsByIdForUrlOptions, "tracker" | "repository">) =>
    deriveEventsByIdForUrl({...options, tracker: this.tracker, repository: this.repository})

  deriveItemsByKey = <T>(options: Omit<ItemsByKeyOptions<T>, "repository">) =>
    deriveItemsByKey<T>({...options, repository: this.repository})

  deriveIsDeleted = (event: TrustedEvent) => deriveIsDeleted(this.repository, event)
}
