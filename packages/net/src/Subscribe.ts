import {ctx, Emitter, max, chunk, randomId, once, groupBy, uniq} from "@welshman/lib"
import {
  LOCAL_RELAY_URL,
  matchFilters,
  normalizeRelayUrl,
  unionFilters,
  TrustedEvent,
} from "@welshman/util"
import type {Filter} from "@welshman/util"
import {Tracker} from "./Tracker.js"
import {Executor} from "./Executor.js"
import {Connection} from "./Connection.js"
import {ConnectionEvent} from "./ConnectionEvent.js"

// `subscribe` is a super function that handles batching subscriptions by merging
// them based on parameters (filters and subscribe opts), then splits them by relay.
// This results in fewer REQs being opened per connection, fewer duplicate events
// being downloaded, and therefore less signature validation.
//
// Behavior can be further configured using ctx.net. This can be useful for
// adding support for querying a local cache like a relay, tracking deleted events,
// and bypassing validation for trusted relays.
//
// Urls that any given event was seen on are tracked using subscription request's `tracker`
// property. These are merged across all subscription requests, so it is possible that an
// event may be seen on more relays that were actually requested, in the case of overlapping
// subscriptions.

export enum SubscriptionEvent {
  Eose = "eose",
  Send = "send",
  Close = "close",
  Event = "event",
  Complete = "complete",
  Duplicate = "duplicate",
  DeletedEvent = "deleted-event",
  FailedFilter = "failed-filter",
  Invalid = "invalid",
}

export type RelaysAndFilters = {
  relays: string[]
  filters: Filter[]
}

export type SubscribeRequest = RelaysAndFilters & {
  delay?: number
  signal?: AbortSignal
  timeout?: number
  tracker?: Tracker
  closeOnEose?: boolean
  authTimeout?: number
}

export class Subscription extends Emitter {
  id = randomId()
  controller = new AbortController()
  tracker = new Tracker()
  completed = new Set()
  executorSubs: {unsubscribe: () => void}[] = []
  executor: Executor

  constructor(readonly request: SubscribeRequest) {
    super()

    if (request.tracker) {
      this.tracker = request.tracker
    }

    this.setMaxListeners(100)
    this.executor = ctx.net.getExecutor(request.relays)
  }

  onEvent = (url: string, event: TrustedEvent) => {
    const {filters} = this.request

    if (this.tracker.track(event.id, url)) {
      this.emit(SubscriptionEvent.Duplicate, url, event)
    } else if (ctx.net.isDeleted(url, event)) {
      this.emit(SubscriptionEvent.DeletedEvent, url, event)
    } else if (!ctx.net.matchFilters(url, filters, event)) {
      this.emit(SubscriptionEvent.FailedFilter, url, event)
    } else if (!ctx.net.isValid(url, event)) {
      this.emit(SubscriptionEvent.Invalid, url, event)
    } else {
      this.emit(SubscriptionEvent.Event, url, event)
    }
  }

  onEose = (url: string) => {
    const {closeOnEose, relays} = this.request

    this.emit(SubscriptionEvent.Eose, url)

    this.completed.add(url)

    if (closeOnEose && this.completed.size === uniq(relays).length) {
      this.onComplete()
    }
  }

  onClose = (connection: Connection) => {
    const {relays} = this.request

    this.emit(SubscriptionEvent.Close, connection.url)

    this.completed.add(connection.url)

    if (this.completed.size === uniq(relays).length) {
      this.onComplete()
    }
  }

  onComplete = once(() => {
    this.emit(SubscriptionEvent.Complete)
    this.executorSubs.forEach(sub => sub.unsubscribe())
    this.removeAllListeners()
    this.executor.target.cleanup()
    this.executor.target.connections.forEach((c: Connection) => {
      c.off(ConnectionEvent.Close, this.onClose)
    })
  })

  execute = async () => {
    const {filters, signal, timeout, authTimeout = 0} = this.request

    // If we didn't get any filters, don't even send the request, just close it.
    // This can be valid when a caller fulfills a request themselves but still needs a subscription object.
    if (filters.length === 0) {
      this.emit(SubscriptionEvent.Send)
      this.onComplete()

      return
    }

    // Hook up our events

    // Listen for abort via caller signal
    signal?.addEventListener("abort", this.onComplete)

    // Listen for abort via our own internal signal
    this.controller.signal.addEventListener("abort", this.onComplete)

    // If we have a timeout, complete the subscription automatically
    if (timeout) setTimeout(this.onComplete, timeout + authTimeout)

    // If one of our connections gets closed make sure to kill our sub
    this.executor.target.connections.forEach((c: Connection) =>
      c.on(ConnectionEvent.Close, this.onClose),
    )

    // Wait for auth if needed
    await Promise.all(
      this.executor.target.connections.map(async (connection: Connection) => {
        if (authTimeout) {
          await connection.auth.attempt(authTimeout)
        }
      }),
    )

    // If we send too many filters in a request relays will refuse to respond. REQs are rate
    // limited client-side by Connection, so this will throttle concurrent requests.
    for (const filtersChunk of chunk(8, filters)) {
      this.executorSubs.push(
        this.executor.subscribe(filtersChunk, {
          onEvent: this.onEvent,
          onEose: this.onEose,
        }),
      )
    }

    // Notify that we've sent the subscription
    this.emit(SubscriptionEvent.Send)
  }

  close = () => this.controller.abort()
}

export const calculateSubscriptionGroup = (sub: Subscription) => {
  const parts: string[] = []

  if (sub.request.timeout) parts.push(`timeout:${sub.request.timeout}`)
  if (sub.request.authTimeout) parts.push(`authTimeout:${sub.request.authTimeout}`)
  if (sub.request.closeOnEose) parts.push("closeOnEose")

  return parts.join("|")
}

export const mergeSubscriptions = (subs: Subscription[]) => {
  const mergedSub = new Subscription({
    relays: uniq(subs.flatMap(sub => sub.request.relays)),
    filters: unionFilters(subs.flatMap(sub => sub.request.filters)),
    timeout: max(subs.map(sub => sub.request.timeout || 0)),
    authTimeout: max(subs.map(sub => sub.request.authTimeout || 0)),
    closeOnEose: subs.every(sub => sub.request.closeOnEose),
  })

  mergedSub.controller.signal.addEventListener("abort", () => {
    for (const sub of subs) {
      sub.close()
    }
  })

  const completedSubs = new Set()

  for (const sub of subs) {
    // Propagate events, but avoid duplicates
    sub.on(SubscriptionEvent.Event, (url: string, event: TrustedEvent) => {
      if (!mergedSub.tracker.track(event.id, url)) {
        mergedSub.emit(SubscriptionEvent.Event, url, event)
      }
    })

    // Propagate subscription completion. Since we split subs by relay, we need to wait
    // until all relays are completed before we notify
    sub.on(SubscriptionEvent.Complete, () => {
      completedSubs.add(sub.id)

      if (completedSubs.size === subs.length) {
        mergedSub.emit(SubscriptionEvent.Complete)
      }

      sub.removeAllListeners()
    })

    // Propagate everything else too
    const propagateEvent = (type: SubscriptionEvent) =>
      sub.on(type, (...args) => mergedSub.emit(type, ...args))

    propagateEvent(SubscriptionEvent.Duplicate)
    propagateEvent(SubscriptionEvent.DeletedEvent)
    propagateEvent(SubscriptionEvent.FailedFilter)
    propagateEvent(SubscriptionEvent.Invalid)
    propagateEvent(SubscriptionEvent.Eose)
    propagateEvent(SubscriptionEvent.Send)
    propagateEvent(SubscriptionEvent.Close)
  }

  return mergedSub
}

export const optimizeSubscriptions = (subs: Subscription[]) => {
  return Array.from(groupBy(calculateSubscriptionGroup, subs).values()).flatMap(group => {
    const timeout = max(group.map(sub => sub.request.timeout || 0))
    const authTimeout = max(group.map(sub => sub.request.authTimeout || 0))
    const closeOnEose = group.every(sub => sub.request.closeOnEose)
    const completedSubs = new Set<string>()
    const abortedSubs = new Set<string>()
    const closedSubs = new Set<string>()
    const eosedSubs = new Set<string>()
    const sentSubs = new Set<string>()
    const mergedSubs: Subscription[] = []

    for (const {relays, filters} of ctx.net.optimizeSubscriptions(group)) {
      for (const filter of filters) {
        const mergedSub = new Subscription({
          filters: [filter],
          relays,
          timeout,
          authTimeout,
          closeOnEose,
        })

        for (const {id, controller, request} of group) {
          const onAbort = () => {
            abortedSubs.add(id)

            if (abortedSubs.size === group.length) {
              mergedSub.close()
            }
          }

          request.signal?.addEventListener("abort", onAbort)
          controller.signal.addEventListener("abort", onAbort)
        }

        mergedSub.on(SubscriptionEvent.Event, (url: string, event: TrustedEvent) => {
          for (const sub of group) {
            if (matchFilters(sub.request.filters, event) && !sub.tracker.track(event.id, url)) {
              sub.emit(SubscriptionEvent.Event, url, event)
            }
          }
        })

        // Pass events back to caller
        const propagateEvent = (type: SubscriptionEvent) =>
          mergedSub.on(type, (url: string, event: TrustedEvent) => {
            for (const sub of group) {
              if (matchFilters(sub.request.filters, event)) {
                sub.emit(type, url, event)
              }
            }
          })

        propagateEvent(SubscriptionEvent.Duplicate)
        propagateEvent(SubscriptionEvent.DeletedEvent)
        propagateEvent(SubscriptionEvent.Invalid)

        const propagateFinality = (type: SubscriptionEvent, subIds: Set<string>) =>
          mergedSub.on(type, (...args: any[]) => {
            subIds.add(mergedSub.id)

            // Wait for all subscriptions to complete before reporting finality to the caller.
            // This is sub-optimal, but because we're outsourcing filter/relay optimization
            // we can't make any assumptions about which caller subscriptions have completed
            // at any given time.
            if (subIds.size === mergedSubs.length) {
              for (const sub of group) {
                sub.emit(type, ...args)
              }
            }

            if (type === SubscriptionEvent.Complete) {
              mergedSub.removeAllListeners()
            }
          })

        propagateFinality(SubscriptionEvent.Send, sentSubs)
        propagateFinality(SubscriptionEvent.Eose, eosedSubs)
        propagateFinality(SubscriptionEvent.Close, closedSubs)
        propagateFinality(SubscriptionEvent.Complete, completedSubs)

        mergedSubs.push(mergedSub)
      }
    }

    return mergedSubs
  })
}

export const executeSubscription = (sub: Subscription) =>
  optimizeSubscriptions([sub]).forEach(sub => sub.execute())

export const executeSubscriptions = (subs: Subscription[]) =>
  optimizeSubscriptions(subs).forEach(sub => sub.execute())

export const executeSubscriptionBatched = (() => {
  const subs: Subscription[] = []
  const timeouts: number[] = []

  const executeAll = () => {
    executeSubscriptions(subs.splice(0))

    for (const timeout of timeouts.splice(0)) {
      clearTimeout(timeout)
    }
  }

  return (sub: Subscription) => {
    subs.push(sub)
    timeouts.push(setTimeout(executeAll, Math.max(16, sub.request.delay!)) as unknown as number)
  }
})()

export type SubscribeRequestWithHandlers = SubscribeRequest & {
  onEvent?: (event: TrustedEvent) => void
  onEose?: (url: string) => void
  onClose?: (url: string) => void
  onComplete?: () => void
}

export const subscribe = ({
  onEvent,
  onEose,
  onClose,
  onComplete,
  ...request
}: SubscribeRequestWithHandlers) => {
  const sub: Subscription = new Subscription({delay: 50, ...request})

  for (const relay of request.relays) {
    if (relay !== LOCAL_RELAY_URL && relay !== normalizeRelayUrl(relay)) {
      console.warn(`Attempted to open subscription to non-normalized url ${relay}`)
    }
  }

  if (request.delay === 0) {
    executeSubscription(sub)
  } else {
    executeSubscriptionBatched(sub)
  }

  // Signature for onEvent is different from emitter signature for historical reasons and convenience
  if (onEvent) sub.on(SubscriptionEvent.Event, (url: string, event: TrustedEvent) => onEvent(event))
  if (onEose) sub.on(SubscriptionEvent.Eose, onEose)
  if (onClose) sub.on(SubscriptionEvent.Close, onClose)
  if (onComplete) sub.on(SubscriptionEvent.Complete, onComplete)

  return sub
}
