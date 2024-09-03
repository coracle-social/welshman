import {isNil} from "@welshman/lib"
import {Repository, Relay, LOCAL_RELAY_URL, getFilterResultCardinality} from "@welshman/util"
import type {TrustedEvent, Filter} from "@welshman/util"
import {Tracker, subscribe as baseSubscribe} from "@welshman/net"
import type {SubscribeRequest} from "@welshman/net"
import {createEventStore} from "@welshman/store"

export const AppContext: {
  BOOTSTRAP_RELAYS: string[]
  DUFFLEPUD_URL?: string
  [key: string]: any
} = {
  BOOTSTRAP_RELAYS: [],
  DUFFLEPUD_URL: undefined,
}

export const repository = new Repository<TrustedEvent>()

export const events = createEventStore(repository)

export const relay = new Relay(repository)

export const tracker = new Tracker()

export const subscribe = (request: Partial<SubscribeRequest> & {filters: Filter[]}) => {
  const events: TrustedEvent[] = []

  // If we already have all results for any filter, don't send the filter to the network
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

  const sub = baseSubscribe({delay: 50, authTimeout: 3000, relays: [], ...request})

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

export const load = (request: Partial<SubscribeRequest> & {filters: Filter[]}) =>
  new Promise<TrustedEvent[]>(resolve => {
    const sub = subscribe({closeOnEose: true, timeout: 3000, ...request})
    const events: TrustedEvent[] = []

    sub.emitter.on("event", (url: string, e: TrustedEvent) => events.push(e))
    sub.emitter.on("complete", () => resolve(events))
  })

export const loadOne = (request: Partial<SubscribeRequest> & {filters: Filter[]}) =>
  new Promise<TrustedEvent | null>(resolve => {
    const sub = subscribe({closeOnEose: true, timeout: 3000, ...request})

    sub.emitter.on("event", (url: string, event: TrustedEvent) => {
      resolve(event)
      sub.close()
    })

    sub.emitter.on("complete", () => {
      resolve(null)
    })
  })
