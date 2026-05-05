import {Maybe} from '@welshman/lib'
import {Repository, AdapterFactory, NetContext, WrapManager, DiffOptions, PullOptions, PushOptions, RequestOptions, PublishOptions, LoaderOptions, Tracker, Pool, push, pull, diff, publish, request, makeLoader} from '@welshman/net'
import {RelayStats} from './relayStats.js'
import {User} from './user.js'

export type ClientOptions = {
  user?: User
  getAdapter?: AdapterFactory
  socketPolicies?: SocketPolicy[]
}

export class Client {
  user?: User
  pool: Pool
  tracker: Tracker
  repository: Repository
  wrapManager: WrapManager
  netContext: NetContext
  relayStats: RelayStats

  constructor(options: ClientOptions) {
    this.user = options.user
    this.pool = new Pool({
      makeSocket: (url: string) => {
        const socketPolicies = options.socketPolicies ?? defaultSocketPolicies

        if (this.user) {
          socketPolicies = [...socketPolicies, this.user.makeSocketPolicyAuth()]
        }

        return makeSocket(url, socketPolicies)
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
  }

  cleanup() {
    this.pool.clear()
    this.tracker.clear()
    this.repository.clear()
    this.wrapManager.clear()
    this.relayStats.cleanup()
  }

  // Bind net utilities to client net context

  request = (options: RequestOptions) => request({...context: this.netContext, ...options})

  makeLoader = (options: LoaderOptions) => makeLoader({...context: this.netContext, ...options})

  publish = (options: PublishOptions) => publish({...context: this.netContext, ...options})

  diff = (options: DiffOptions) => diff({...context: this.netContext, ...options})

  pull = (options: PullOptions) => pull({...context: this.netContext, ...options})

  push = (options: PushOptions) => push({...context: this.netContext, ...options})

  // Bind store utilities to client stuff

  getEventsById = (options: Omit<EventsByIdOptions 'repository'>) =>
    getEventsById({repository: this.repository, ...options})

  deriveEventsById = (options: Omit<EventsByIdOptions 'repository'>) =>
    deriveEventsById({repository: this.repository, ...options})

  deriveEvents = (options: Omit<EventsByIdOptions 'repository'>) =>
    deriveEvents({repository: this.repository, ...options})

  makeDeriveEvent = (options: Omit<EventOptions, 'repository'>) =>
    makeDeriveEvent({repository: this.repository, ...options})

  getEventsByIdByUrl = (options: Omit<EventsByIdByUrlOptions, 'tracker' | 'repository'>) =>
    getEventsByIdByUrl({tracker: this.tracker, repository: this.repository, ...options})

  deriveEventsByIdByUrl = (options: Omit<EventsByIdByUrlOptions, 'tracker' | 'repository'>) =>
    deriveEventsByIdByUrl({tracker: this.tracker, repository: this.repository, ...options})

  getEventsByIdForUrl = (options: Omit<EventsByIdForUrlOptions, 'tracker' | 'repository'>) =>
    getEventsByIdForUrl({tracker: this.tracker, repository: this.repository, ...options})

  deriveEventsByIdForUrl = (options: Omit<EventsByIdForUrlOptions, 'tracker' | 'repository'>)
    deriveEventsByIdForUrl({tracker: this.tracker, repository: this.repository, ...options})

  deriveItemsByKey = <T>(options: Omit<ItemsByKeyOptions<T>, 'repository'>) =>
    deriveEventsByIdForUrl({repository: this.repository, ...options})

  deriveIsDeleted = (event: TrustedEvent) => deriveIsDeleted(this.repository, event)
}
