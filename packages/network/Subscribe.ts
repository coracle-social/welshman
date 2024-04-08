import type {Event} from 'nostr-tools'
import {Emitter, randomId, groupBy, batch, defer, uniq, uniqBy} from '@coracle.social/lib'
import type {Deferred} from '@coracle.social/lib'
import {matchFilters, mergeFilters} from '@coracle.social/util'
import type {Filter} from '@coracle.social/util'
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
  Abort = "abort",
  Complete = "complete",
  Duplicate = "duplicate",
  DeletedEvent = "deleted-event",
  FailedFilter = "failed-filter",
  InvalidSignature = "invalid-signature",
}

export type SubscribeRequest = {
  relays: string[]
  filters: Filter[]
  timeout?: number
  immediate?: boolean
  closeOnEose?: boolean
}

export type Subscription = {
  id: string
  emitter: Emitter
  tracker: Tracker
  result: Deferred<Event[]>
  request: SubscribeRequest
  close: () => void
}

export const makeSubscription = (request: SubscribeRequest) => {
  const id = randomId()
  const emitter = new Emitter()
  const tracker = new Tracker()
  const result = defer<Event[]>()
  const close = () => emitter.emit('abort')

  emitter.setMaxListeners(100)

  return {id, request, emitter, tracker, result, close}
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

  for (const group of Object.values(groupBy(calculateSubscriptionGroup, subs))) {
    for (const relay of uniq(group.flatMap((sub: Subscription) => sub.request.relays))) {
      const abortedSubs = new Set()
      const callerSubs = group.filter((sub: Subscription) => sub.request.relays.includes(relay))
      const mergedSub = makeSubscription({
        relays: [relay],
        timeout: callerSubs[0].request.timeout,
        filters: mergeFilters(callerSubs.flatMap((sub: Subscription) => sub.request.filters)),
      })

      for (const {id, emitter} of callerSubs) {
        // Propagate abort event from the caller to the merged subscription
        emitter.on(SubscriptionEvent.Abort, () => {
          abortedSubs.add(id)

          if (abortedSubs.size === callerSubs.length) {
            mergedSub.close()
          }
        })
      }

      mergedSub.emitter.on(SubscriptionEvent.Event, (url: string, event: Event) => {
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
        mergedSub.emitter.on(type,  (url: string, event: Event) => {
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

      // Propagate promise resolution
      mergedSub.result.then((events: Event[]) => {
        events = uniqBy((event: Event) => event.id, events)

        for (const sub of callerSubs) {
          sub.result.resolve(events.filter((e: Event) => matchFilters(sub.request.filters, e)))
        }
      })

      mergedSubscriptions.push(mergedSub)
    }
  }

  // console.log(
  //   `Starting ${mergedSubscriptions.length} subscriptions on ${uniq(mergedSubscriptions.flatMap(s => s.request.relays)).length} relays`,
  //   uniq(mergedSubscriptions.flatMap(s => s.request.relays)),
  //   ...mergeFilters(mergedSubscriptions.flatMap(s => s.request.filters)),
  // )

  return mergedSubscriptions
}

export const executeSubscription = (sub: Subscription) => {
  const {result, request, emitter, tracker} = sub
  const {timeout, filters, closeOnEose, relays} = request
  const executor = NetworkContext.getExecutor(relays)
  const events: Event[] = []

  const completedRelays = new Set()
  let completed: number

  const complete = () => {
    if (completed) return

    // Mark as cleaned upp, unsubscribe our executor
    completed = Date.now()
    executorSub.unsubscribe()

    // Resolve our promise
    result.resolve(events)

    // Notify caller, clean up our event emitter
    emitter.emit(SubscriptionEvent.Complete)
    emitter.removeAllListeners()

    // Remove our onClose handler from connections, since they are shared by many subs
    executor.target.connections.forEach((c: Connection) => c.off("close", onClose))
    executor.target.cleanup()
  }

  const onEvent = (url: string, event: Event) => {
    // Check the signature and filters. If we've seen this event, don't re-validate.
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
      events.push(event)
    }
  }

  const onEose = (url: string) => {
    completedRelays.add(url)

    emitter.emit(SubscriptionEvent.Eose, url)

    if (closeOnEose && completedRelays.size === executor.target.connections.length) {
      complete()
    }
  }

  const onClose = (connection: Connection) => {
    completedRelays.add(connection.url)

    emitter.emit(SubscriptionEvent.Close, connection.url)

    if (completedRelays.size === executor.target.connections.length) {
      complete()
    }
  }

  // Allow the caller to cancel the subscription
  emitter.on(SubscriptionEvent.Abort, complete)

  // If we have a timeout, complete the subscription automatically
  if (timeout) setTimeout(complete, timeout)

  // If one of our connections gets closed make sure to kill our sub
  executor.target.connections.forEach((c: Connection) => c.on('close', onClose))

  // Finally, start our subscription
  const executorSub = executor.subscribe(filters, {onEvent, onEose})
}

export const executeSubscriptions = (subs: Subscription[]) =>
  mergeSubscriptions(subs).forEach(executeSubscription)

export const executeSubscriptionBatched = batch(800, executeSubscriptions)

export const subscribe = (request: SubscribeRequest) => {
  const subscription: Subscription = makeSubscription(request)

  if (request.filters.length === 0) {
    throw new Error("Zero filters passed to subscribe")
  }

  if (request.immediate) {
    // console.log(
    //   `Starting 1 subscriptions on ${request.relays.length} relays`,
    //   request.relays,
    //   ...mergeFilters(request.filters)
    // )

    executeSubscription(subscription)
  } else {
    executeSubscriptionBatched(subscription)
  }

  return subscription
}
