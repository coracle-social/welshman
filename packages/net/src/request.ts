import {EventEmitter} from "events"
import {on, uniq, lt, flatten, addToMapKey, defer, Deferred, call, randomId, yieldThread, pushToMapKey, batcher} from "@welshman/lib"
import {
  Filter,
  getAddress,
  unionFilters,
  matchFilters,
  TrustedEvent,
  getFilterResultCardinality,
} from "@welshman/util"
import {RelayMessage, ClientMessageType, isRelayEvent, isRelayEose} from "./message.js"
import {getAdapter, AdapterContext, AbstractAdapter, AdapterEvent} from "./adapter.js"
import {SocketEvent, SocketStatus} from "./socket.js"
import {Unsubscriber} from "./util.js"
import {netContext} from "./context.js"
import {Tracker} from "./tracker.js"

const deduplicateEvents = (events: TrustedEvent[]) => {
  const eventsByAddress = new Map<string, TrustedEvent>()

  for (const event of events) {
    const address = getAddress(event)

    if (lt(eventsByAddress.get(address)?.created_at, event.created_at)) {
      eventsByAddress.set(address, event)
    }
  }

  return Array.from(eventsByAddress.values())
}

export type RequestOneOptions = {
  relay: string
  filters: Filter[]
  signal?: AbortSignal
  tracker?: Tracker
  context?: AdapterContext
  autoClose?: boolean
  isEventValid?: (event: TrustedEvent, url: string) => boolean
  isEventDeleted?: (event: TrustedEvent, url: string) => boolean
  onEvent?: (event: TrustedEvent, url: string) => void
  onDeleted?: (event: unknown, url: string) => void
  onInvalid?: (event: unknown, url: string) => void
  onFiltered?: (event: TrustedEvent, url: string) => void
  onDuplicate?: (event: TrustedEvent, url: string) => void
  onDisconnect?: (url: string) => void
  onEose?: (url: string) => void
  onClose?: () => void
}

export const requestOne = (options: RequestOneOptions) => {
  const ids = new Set<string>()
  const eose = new Set<string>()
  const events: TrustedEvent[] = []
  const deferred = defer<TrustedEvent[]>()
  const tracker = options.tracker || new Tracker()
  const adapter = getAdapter(options.relay, options.context)
  const isEventValid = options.isEventValid || netContext.isEventValid
  const isEventDeleted = options.isEventDeleted || netContext.isEventDeleted

  let closed = false

  const close = () => {
    if (closed) return

    closed = true

    for (const id of ids) {
      adapter.send(["CLOSE", id])
    }

    options.onClose?.()
    adapter.cleanup()
    unsubscribers.map(call)
    deferred.resolve(deduplicateEvents(events))
  }

  const unsubscribers = [
    on(adapter, AdapterEvent.Receive, (message: RelayMessage, url: string) => {
      if (isRelayEvent(message)) {
        const [_, id, event] = message

        if (ids.has(id)) {
          if (tracker.track(event.id, url)) {
            options.onDuplicate?.(event, url)
          } else if (isEventDeleted(event, url)) {
            options.onDeleted?.(event, url)
          } else if (!isEventValid(event, url)) {
            options.onInvalid?.(event, url)
          } else if (!matchFilters(options.filters, event)) {
            options.onFiltered?.(event, url)
          } else {
            options.onEvent?.(event, url)
            events.push(event)
          }
        }
      }

      if (isRelayEose(message)) {
        const [_, id] = message

        if (ids.has(id)) {
          eose.add(id)

          if (eose.size === ids.size) {
            options.onEose?.(url)

            if (options.autoClose) {
              close()
            }
          }
        }
      }
    }),
  ]

  // Listen to disconnects from any sockets
  for (const socket of adapter.sockets) {
    unsubscribers.push(
      on(socket, SocketEvent.Status, (status: SocketStatus) => {
        if (![SocketStatus.Open, SocketStatus.Opening].includes(status)) {
          options.onDisconnect?.(socket.url)

          if (options.autoClose) {
            close()
          }
        }
      }),
    )
  }

  // Handle abort signal
  options.signal?.addEventListener("abort", close)

  // If we're auto-closing, make sure it happens even if the relay doesn't send an eose
  // and the caller doesn't provide a signal, in order to avoid memory leaks
  if (options.autoClose && !options.signal) {
    setTimeout(close, 30_000)
  }

  for (const filter of options.filters) {
    const id = `REQ-${randomId().slice(0, 8)}`

    ids.add(id)
    adapter.send([ClientMessageType.Req, id, filter])
  }

  return deferred
}

export type RequestOptions = Omit<RequestOneOptions, "relay"> & {
  relays: string[]
  threshold?: number
}

export const request = async (options: RequestOptions) => {
  const closed = new Set<string>()
  const tracker = new Tracker()
  const relays = new Set(options.relays)
  const ctrl = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, ctrl.signal]) : ctrl.signal
  const threshold = options.threshold || 1
  const promises: Promise<TrustedEvent[]>[] = []

  if (relays.size !== options.relays.length) {
    console.warn("Non-unique relays passed to request")
  }

  return flatten(
    await Promise.all(
      Array.from(relays).map(relay =>
        requestOne({
          ...options,
          tracker,
          signal,
          relay,
          onClose: () => {
            closed.add(relay)

            if (closed.size >= relays.size * threshold) {
              options.onClose?.()
              ctrl.abort()
            }
          }
        })
      )
    )
  )
}


export type LoaderOptions = {
  delay: number
  timeout?: number
  threshold?: number
  context?: AdapterContext
  isEventValid?: (event: TrustedEvent, url: string) => boolean
  isEventDeleted?: (event: TrustedEvent, url: string) => boolean
}

export type LoadOptions = {
  relays: string[]
  filters: Filter[]
  signal?: AbortSignal
  onEvent?: (event: TrustedEvent, url: string) => void
  onDisconnect?: (url: string) => void
  onEose?: (url: string) => void
  onClose?: () => void
}

/**
 * Creates a convenience function which returns a promise of events from a request.
 * It may return early if filter cardinality is known, and it delays requests in order
 * to implement batching
 * @param options - LoaderOptions
 * @returns - a load function
 */
export const makeLoader = (options: LoaderOptions) =>
  batcher(options.delay, async (allRequests: LoadOptions[]) => {
    const resultsByRequest = new Map<LoadOptions, Deferred<TrustedEvent[]>>()
    const eventsByRequest = new Map<LoadOptions, TrustedEvent[]>()
    const requestsByRelay = new Map<string, LoadOptions[]>()
    const controllersByRelay = new Map<string, AbortController>()
    const signalsByRelay = new Map<string, AbortSignal>()
    const closedRequestsByRelay = new Map<string, Set<LoadOptions>>()
    const closedRelaysByRequest = new Map<LoadOptions, Set<string>>()
    const relays = uniq(allRequests.flatMap(r => r.relays))
    const threshold = options.threshold || 1
    const tracker = new Tracker()

    const close = (relay: string, request: LoadOptions) => {
      addToMapKey(closedRequestsByRelay, relay, request)
      addToMapKey(closedRelaysByRequest, request, relay)

      const closedRelays = closedRelaysByRequest.get(request)?.size || 0
      if (closedRelays >= uniq(request.relays).length * threshold) {
        const events = deduplicateEvents(eventsByRequest.get(request) || [])

        request.onClose?.()
        resultsByRequest.get(request)?.resolve(events)
      }

      if (closedRequestsByRelay.get(relay)?.size === requestsByRelay.get(relay)?.length) {
        controllersByRelay.get(relay)?.abort()
      }
    }

    for (const request of allRequests) {
      for (const relay of uniq(request.relays)) {
        pushToMapKey(requestsByRelay, relay, request)
        resultsByRequest.set(request, defer())

        // Propagate abort when all requests have been closed for a given relay
        request.signal?.addEventListener('abort', () => close(relay, request))
      }
    }

    // Create an abort controller for each relay
    for (const relay of relays) {
      const controller = new AbortController()
      const signals = [controller.signal]

      if (options.timeout) {
        signals.push(AbortSignal.timeout(options.timeout))
      }

      controllersByRelay.set(relay, controller)
      signalsByRelay.set(relay, AbortSignal.any(signals))
    }

    Array.from(requestsByRelay).forEach(
      async ([relay, requests]) => {
        // Union all filters for a given request and send them together
        const filters = unionFilters(requests.flatMap(r => r.filters))

        // Propagate events to caller, but only for requests that have not been aborted
        const getOpenRequests = () =>
          requests.filter(request => !closedRequestsByRelay.get(relay)?.has(request))

        requestOne({
          relay,
          filters,
          tracker,
          autoClose: true,
          signal: signalsByRelay.get(relay),
          context: options.context,
          isEventValid: options.isEventValid,
          isEventDeleted: options.isEventDeleted,
          onEvent: (event: TrustedEvent, url: string) => {
            for (const request of getOpenRequests()) {
              if (matchFilters(request.filters, event)) {
                pushToMapKey(eventsByRequest, request, event)
                request.onEvent?.(event, url)

                // Calculate cardinality for unioned filters so that we can return early
                if (request.filters.length === 1) {
                  const cardinality = getFilterResultCardinality(request.filters[0])

                  if (eventsByRequest.get(request)?.length === cardinality) {
                    close(relay, request)
                  }
                }
              }
            }
          },
          onDisconnect: (url: string) => getOpenRequests().forEach(request => request.onDisconnect?.(url)),
          onEose: (url: string) => getOpenRequests().forEach(request => request.onEose?.(url)),
          onClose: () => requests.forEach(request => close(relay, request)),
        })
      }
    )

    return allRequests.map(r => resultsByRequest.get(r)!)
  })

export const load = makeLoader({delay: 200, timeout: 3000, threshold: 0.5})
