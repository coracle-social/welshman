import {isNil} from "@welshman/lib"
import {Repository, Relay, LOCAL_RELAY_URL, getFilterResultCardinality} from "@welshman/util"
import type {TrustedEvent, Filter} from "@welshman/util"
import {Tracker, subscribe as baseSubscribe} from "@welshman/net"
import type {SubscribeRequest} from "@welshman/net"
import {createEventStore} from "@welshman/store"
import type {Router} from './router'

export const AppContext: {
  router: Router,
  requestDelay: number
  requestTimeout: number
  dufflepudUrl?: string
  splitRequest?: (req: PartialSubscribeRequest) => SubscribeRequest[]
} = {
  router: undefined as unknown as Router,
  requestDelay: 50,
  requestTimeout: 3000,
}

export const repository = new Repository<TrustedEvent>()

export const events = createEventStore(repository)

export const relay = new Relay(repository)

export const tracker = new Tracker()

export type PartialSubscribeRequest = Partial<SubscribeRequest> & {filters: Filter[]}

export const subscribe = (request: PartialSubscribeRequest) => {
  const events: TrustedEvent[] = []

  // If we already have all results for any filter, don't send the filter to the network
  if (request.closeOnEose) {
    for (const filter of request.filters.splice(0)) {
      const cardinality = getFilterResultCardinality(filter)

      if (!isNil(cardinality)) {
        const results = repository.query([filter])

        if (results.length === cardinality) {
          for (const event of results) {
            events.push(event)
          }

          break
        }
      }

      request.filters.push(filter)
    }
  }

  // Make sure to query our local relay too
  const delay = AppContext.requestDelay
  const timeout = AppContext.requestTimeout
  const sub = baseSubscribe({delay, authTimeout: timeout, relays: [], ...request})

  sub.emitter.on("event", (url: string, e: TrustedEvent) => {
    repository.publish(e)
  })

  // Keep cached results async so the caller can set up handlers
  setTimeout(() => {
    for (const event of events) {
      sub.emitter.emit("event", LOCAL_RELAY_URL, event)
    }
  })

  return sub
}

export const load = (request: PartialSubscribeRequest) =>
  new Promise<TrustedEvent[]>(resolve => {
    const sub = subscribe({closeOnEose: true, timeout: AppContext.requestTimeout, ...request})
    const events: TrustedEvent[] = []

    sub.emitter.on("event", (url: string, e: TrustedEvent) => events.push(e))
    sub.emitter.on("complete", () => resolve(events))
  })
