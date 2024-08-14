import {Emitter, chunk, randomId, once, groupBy, uniq} from '@welshman/lib'
import {matchFilters, unionFilters, SignedEvent} from '@welshman/util'
import type {Filter} from '@welshman/util'
import {Tracker} from "./Tracker"
import {Connection} from './Connection'
import {NetworkContext} from './Context'

// `subscribe` is a super function that handles batching subscriptions by merging
// them based on parameters (filters and subscribe opts), then splits them by relay.
// This results in fewer REQs being opened per connection, fewer duplicate events
// being downloaded, and therefore less signature validation.
//
// Behavior can be further configured using NetworkContext. This can be useful for
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

export type SubscribeRequest = {
  relays: string[]
  filters: Filter[]
  delay?: number
  signal?: AbortSignal
  timeout?: number
  tracker?: Tracker
  closeOnEose?: boolean
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
  if (sub.request.closeOnEose) parts.push('closeOnEose')

  return parts.join('|')
}

export const mergeSubscriptions = (subs: Subscription[]) => {
  const completedRelays = new Set()
  const mergedSubscriptions = []

  for (const group of groupBy(calculateSubscriptionGroup, subs).values()) {
    const groupSubscriptions = []

    for (const relay of uniq(group.flatMap((sub: Subscription) => sub.request.relays))) {
      const abortedSubs = new Set()
      const callerSubs = group.filter((sub: Subscription) => sub.request.relays.includes(relay))
      const mergedSub = makeSubscription({
        relays: [relay],
        timeout: callerSubs[0].request.timeout,
        closeOnEose: callerSubs[0].request.closeOnEose,
        filters: unionFilters(callerSubs.flatMap((sub: Subscription) => sub.request.filters)),
      })

      for (const {id, controller, request} of callerSubs) {
        const onAbort = () => {
          abortedSubs.add(id)

          if (abortedSubs.size === callerSubs.length) {
            mergedSub.close()
          }
        }

        request.signal?.addEventListener('abort', onAbort)
        controller.signal.addEventListener('abort', onAbort)
      }

      mergedSub.emitter.on(SubscriptionEvent.Event, (url: string, event: SignedEvent) => {
        for (const sub of callerSubs) {
          if (sub.tracker.track(event.id, url)) {
            continue
          }

          if (!matchFilters(sub.request.filters, event)) {
            continue
          }

          sub.emitter.emit(SubscriptionEvent.Event, url, event)
        }
      })

      // Pass events back to caller
      const propagateEvent = (type: SubscriptionEvent, checkFilter: boolean) =>
        mergedSub.emitter.on(type,  (url: string, event: SignedEvent) => {
          for (const sub of callerSubs) {
            if (!checkFilter || matchFilters(sub.request.filters, event)) {
              sub.emitter.emit(type, url, event)
            }
          }
        })

      propagateEvent(SubscriptionEvent.Duplicate, true)
      propagateEvent(SubscriptionEvent.DeletedEvent, false)
      propagateEvent(SubscriptionEvent.FailedFilter, false)
      propagateEvent(SubscriptionEvent.InvalidSignature, true)

      // Propagate eose
      mergedSub.emitter.on(SubscriptionEvent.Eose, (url: string) => {
        for (const sub of callerSubs) {
          sub.emitter.emit(SubscriptionEvent.Eose, url)
        }
      })

      // Propagate close
      mergedSub.emitter.on(SubscriptionEvent.Close, (url: string) => {
        for (const sub of callerSubs) {
          sub.emitter.emit(SubscriptionEvent.Close, url)
        }
      })

      // Propagate subscription completion. Since we split subs by relay, we need to wait
      // until all relays are completed before we notify
      mergedSub.emitter.on(SubscriptionEvent.Complete, () => {
        completedRelays.add(relay)

        for (const sub of callerSubs) {
          if (sub.request.relays.every(url => completedRelays.has(url))) {
            sub.emitter.emit(SubscriptionEvent.Complete)
          }
        }

        mergedSub.emitter.removeAllListeners()
      })

      mergedSubscriptions.push(mergedSub)
      groupSubscriptions.push(mergedSub)
    }
  }

  return mergedSubscriptions
}

export const executeSubscription = (sub: Subscription) => {
  const {request, emitter, tracker, controller} = sub
  const {timeout, filters, closeOnEose, relays, signal} = request
  const executor = NetworkContext.getExecutor(relays)
  const subs: {unsubscribe: () => void}[] = []
  const completedRelays = new Set()
  const events: SignedEvent[] = []

  // Hook up our events

  emitter.on(SubscriptionEvent.Event, (url: string, event: SignedEvent) => {
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

  const onEvent = (url: string, event: SignedEvent) => {
    if (tracker.track(event.id, url)) {
      emitter.emit(SubscriptionEvent.Duplicate, url, event)
    } else if (NetworkContext.isDeleted(url, event)) {
      emitter.emit(SubscriptionEvent.DeletedEvent, url, event)
    } else if (!NetworkContext.matchFilters(url, filters, event)) {
      emitter.emit(SubscriptionEvent.FailedFilter, url, event)
    } else if (!NetworkContext.hasValidSignature(url, event)) {
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
  if (timeout) setTimeout(onComplete, timeout)

  // If one of our connections gets closed make sure to kill our sub
  executor.target.connections.forEach((c: Connection) => c.on('close', onClose))

  // Finally, start our subscription. If we didn't get any filters, don't even send the
  // request, just close it. This can be valid when a caller fulfills a request themselves.
  if (filters.length > 0) {
    // If we send too many filters in a request relays will refuse to respond. REQs are rate
    // limited client-side by Connection, so this will throttle concurrent requests.
    for (const filtersChunk of chunk(8, filters)) {
      subs.push(executor.subscribe(filtersChunk, {onEvent, onEose}))
    }
  } else {
    onComplete()
  }
}

export const executeSubscriptions = (subs: Subscription[]) =>
  mergeSubscriptions(subs).forEach(executeSubscription)

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

export const subscribe = (request: SubscribeRequest) => {
  const subscription: Subscription = makeSubscription({delay: 800, ...request})

  if (request.delay === 0) {
    executeSubscription(subscription)
  } else {
    executeSubscriptionBatched(subscription)
  }

  return subscription
}
