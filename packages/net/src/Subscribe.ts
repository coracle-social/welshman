import {ctx, Emitter, max, chunk, randomId, once, groupBy, uniq} from '@welshman/lib'
import {matchFilters, unionFilters, TrustedEvent} from '@welshman/util'
import type {Filter} from '@welshman/util'
import {Tracker} from "./Tracker"
import {Connection} from './Connection'

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
  Close = "close",
  Event = "event",
  Complete = "complete",
  Duplicate = "duplicate",
  DeletedEvent = "deleted-event",
  FailedFilter = "failed-filter",
  InvalidSignature = "invalid-signature",
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

export type Subscription = {
  id: string
  emitter: Emitter
  tracker: Tracker
  controller: AbortController
  request: SubscribeRequest
  close: () => void
}

export const makeSubscription = (request: SubscribeRequest) => {
  const id = randomId()
  const emitter = new Emitter()
  const controller = new AbortController()
  const tracker = request.tracker || new Tracker()
  const close = () => controller.abort()

  emitter.setMaxListeners(100)

  return {id, request, emitter, tracker, controller, close}
}

export const calculateSubscriptionGroup = (sub: Subscription) => {
  const parts: string[] = []

  if (sub.request.timeout) parts.push(`timeout:${sub.request.timeout}`)
  if (sub.request.authTimeout) parts.push(`authTimeout:${sub.request.authTimeout}`)
  if (sub.request.closeOnEose) parts.push('closeOnEose')

  return parts.join('|')
}

export const mergeSubscriptions = (subs: Subscription[]) => {
  const mergedSub = makeSubscription({
    relays: uniq(subs.flatMap(sub => sub.request.relays)),
    filters: unionFilters(subs.flatMap(sub => sub.request.filters)),
    timeout: max(subs.map(sub => sub.request.timeout || 0)),
    authTimeout: max(subs.map(sub => sub.request.authTimeout || 0)),
    closeOnEose: subs.every(sub => sub.request.closeOnEose),
  })

  mergedSub.controller.signal.addEventListener('abort', () => {
    for (const sub of subs) {
      sub.close()
    }
  })

  const completedSubs = new Set()

  for (const sub of subs) {
    // Propagate events, but avoid duplicates
    sub.emitter.on(SubscriptionEvent.Event, (url: string, event: TrustedEvent) => {
      if (!mergedSub.tracker.track(event.id, url)) {
        mergedSub.emitter.emit(SubscriptionEvent.Event, url, event)
      }
    })

    // Propagate subscription completion. Since we split subs by relay, we need to wait
    // until all relays are completed before we notify
    sub.emitter.on(SubscriptionEvent.Complete, () => {
      completedSubs.add(sub.id)

      if (completedSubs.size === subs.length) {
        mergedSub.emitter.emit(SubscriptionEvent.Complete)
      }

      sub.emitter.removeAllListeners()
    })

    // Propagate everything else too
    const propagateEvent = (type: SubscriptionEvent) =>
      sub.emitter.on(type, (...args) => mergedSub.emitter.emit(type, ...args))

    propagateEvent(SubscriptionEvent.Duplicate)
    propagateEvent(SubscriptionEvent.DeletedEvent)
    propagateEvent(SubscriptionEvent.FailedFilter)
    propagateEvent(SubscriptionEvent.InvalidSignature)
    propagateEvent(SubscriptionEvent.Eose)
    propagateEvent(SubscriptionEvent.Close)
  }

  return mergedSub
}

export const optimizeSubscriptions = (subs: Subscription[]) => {
  return Array.from(groupBy(calculateSubscriptionGroup, subs).values())
    .flatMap(group => {
      const timeout = max(group.map(sub => sub.request.timeout || 0))
      const authTimeout = max(group.map(sub => sub.request.authTimeout || 0))
      const closeOnEose = group.every(sub => sub.request.closeOnEose)
      const completedSubs = new Set<string>()
      const abortedSubs = new Set<string>()
      const closedSubs = new Set<string>()
      const eosedSubs = new Set<string>()
      const mergedSubs = []

      for (const {relays, filters} of ctx.net.optimizeSubscriptions(group)) {
        const mergedSub = makeSubscription({filters,
          relays,
          timeout,
          authTimeout,
          closeOnEose
        })

        for (const {id, controller, request} of group) {
          const onAbort = () => {
            abortedSubs.add(id)

            if (abortedSubs.size === group.length) {
              mergedSub.close()
            }
          }

          request.signal?.addEventListener('abort', onAbort)
          controller.signal.addEventListener('abort', onAbort)
        }

        mergedSub.emitter.on(SubscriptionEvent.Event, (url: string, event: TrustedEvent) => {
          for (const sub of group) {
            if (!sub.tracker.track(event.id, url) && matchFilters(sub.request.filters, event)) {
              sub.emitter.emit(SubscriptionEvent.Event, url, event)
            }
          }
        })

        // Pass events back to caller
        const propagateEvent = (type: SubscriptionEvent) =>
          mergedSub.emitter.on(type,  (url: string, event: TrustedEvent) => {
            for (const sub of group) {
              if (matchFilters(sub.request.filters, event)) {
                sub.emitter.emit(type, url, event)
              }
            }
          })

        propagateEvent(SubscriptionEvent.Duplicate)
        propagateEvent(SubscriptionEvent.DeletedEvent)
        propagateEvent(SubscriptionEvent.InvalidSignature)

        const propagateFinality = (type: SubscriptionEvent, subIds: Set<string>) =>
          mergedSub.emitter.on(type, (...args: any[]) => {
            subIds.add(mergedSub.id)

            // Wait for all subscriptions to complete before reporting finality to the caller.
            // This is sub-optimal, but because we're outsourcing filter/relay optimization
            // we can't make any assumptions about which caller subscriptions have completed
            // at any given time.
            if (subIds.size === group.length) {
              for (const sub of group) {
                sub.emitter.emit(type, ...args)
              }
            }

            if (type === SubscriptionEvent.Complete) {
              mergedSub.emitter.removeAllListeners()
            }
          })

        propagateFinality(SubscriptionEvent.Eose, eosedSubs)
        propagateFinality(SubscriptionEvent.Close, closedSubs)
        propagateFinality(SubscriptionEvent.Complete, completedSubs)

        mergedSubs.push(mergedSub)
      }

      return mergedSubs
    })
}

export const executeSubscription = (sub: Subscription) => {
  const {request, emitter, tracker, controller} = sub
  const {filters, closeOnEose, relays, signal, timeout, authTimeout = 0} = request
  const executor = ctx.net.getExecutor(relays)
  const subs: {unsubscribe: () => void}[] = []
  const completedRelays = new Set()
  const events: TrustedEvent[] = []

  // Hook up our events

  emitter.on(SubscriptionEvent.Event, (url: string, event: TrustedEvent) => {
    events.push(event)
  })

  emitter.on(SubscriptionEvent.Eose, (url: string) => {
    completedRelays.add(url)

    if (closeOnEose && completedRelays.size === executor.target.connections.length) {
      onComplete()
    }
  })

  emitter.on(SubscriptionEvent.Close, (url: string) => {
    completedRelays.add(url)

    if (completedRelays.size === executor.target.connections.length) {
      onComplete()
    }
  })

  emitter.on(SubscriptionEvent.Complete, () => {
    emitter.removeAllListeners()
    subs.forEach(sub => sub.unsubscribe())
    executor.target.connections.forEach((c: Connection) => c.off("close", onClose))
    executor.target.cleanup()
  })

  // Functions for emitting events

  const onEvent = (url: string, event: TrustedEvent) => {
    if (tracker.track(event.id, url)) {
      emitter.emit(SubscriptionEvent.Duplicate, url, event)
    } else if (ctx.net.isDeleted(url, event)) {
      emitter.emit(SubscriptionEvent.DeletedEvent, url, event)
    } else if (!ctx.net.matchFilters(url, filters, event)) {
      emitter.emit(SubscriptionEvent.FailedFilter, url, event)
    } else if (!ctx.net.hasValidSignature(url, event)) {
      emitter.emit(SubscriptionEvent.InvalidSignature, url, event)
    } else {
      emitter.emit(SubscriptionEvent.Event, url, event)
    }
  }

  const onEose = (url: string) =>
    emitter.emit(SubscriptionEvent.Eose, url)

  const onClose = (connection: Connection) =>
    emitter.emit(SubscriptionEvent.Close, connection.url)

  const onComplete = once(() => emitter.emit(SubscriptionEvent.Complete))

  // Listen for abort via caller signal
  signal?.addEventListener('abort', onComplete)

  // Listen for abort via our own internal signal
  controller.signal.addEventListener('abort', onComplete)

  // If we have a timeout, complete the subscription automatically
  if (timeout) setTimeout(onComplete, timeout + authTimeout)

  // If one of our connections gets closed make sure to kill our sub
  executor.target.connections.forEach((c: Connection) => c.on('close', onClose))

  // Finally, start our subscription. If we didn't get any filters, don't even send the
  // request, just close it. This can be valid when a caller fulfills a request themselves.
  if (filters.length > 0) {
    Promise.all(
      executor.target.connections.map(async (connection: Connection) => {
        if (authTimeout) {
          await connection.ensureAuth({timeout: authTimeout})
        }
      })
    ).then(() => {
      // If we send too many filters in a request relays will refuse to respond. REQs are rate
      // limited client-side by Connection, so this will throttle concurrent requests.
      for (const filtersChunk of chunk(8, filters)) {
        subs.push(executor.subscribe(filtersChunk, {onEvent, onEose}))
      }
    })
  } else {
    onComplete()
  }
}

export const executeSubscriptions = (subs: Subscription[]) =>
  optimizeSubscriptions(subs).forEach(executeSubscription)

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
    timeouts.push(setTimeout(executeAll, Math.max(16, sub.request.delay!)))
  }
})()

export type SubscribeRequestWithHandlers = SubscribeRequest & {
  onEvent?: (event: TrustedEvent) => void
  onEose?: (url: string) => void
  onClose?: (url: string) => void
  onComplete?: () => void
}

export const subscribe = ({onEvent, onEose, onClose, onComplete, ...request}: SubscribeRequestWithHandlers) => {
  const sub: Subscription = makeSubscription({delay: 50, ...request})

  if (request.delay === 0) {
    executeSubscription(sub)
  } else {
    executeSubscriptionBatched(sub)
  }

  // Signature for onEvent is different from emitter signature for historical reasons and convenience
  if (onEvent) sub.emitter.on(SubscriptionEvent.Event, (url: string, event: TrustedEvent) => onEvent(event))
  if (onEose) sub.emitter.on(SubscriptionEvent.Eose, onEose)
  if (onClose) sub.emitter.on(SubscriptionEvent.Close, onClose)
  if (onComplete) sub.emitter.on(SubscriptionEvent.Complete, onComplete)

  return sub
}
