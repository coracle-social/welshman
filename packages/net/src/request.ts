import {EventEmitter} from "events"
import {on, call, randomId, yieldThread, pushToMapKey, batcher} from "@welshman/lib"
import {
  Filter,
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

export enum RequestEvent {
  Close = "request:event:close",
  Disconnect = "request:event:disconnect",
  Duplicate = "request:event:duplicate",
  Eose = "request:event:eose",
  Event = "request:event:event",
  Filtered = "request:event:filtered",
  Deleted = "request:event:deleted",
  Invalid = "request:event:invalid",
}

// SingleRequest

export type SingleRequestEvents = {
  [RequestEvent.Event]: (event: TrustedEvent) => void
  [RequestEvent.Deleted]: (event: any) => void
  [RequestEvent.Invalid]: (event: any) => void
  [RequestEvent.Filtered]: (event: TrustedEvent) => void
  [RequestEvent.Duplicate]: (event: TrustedEvent) => void
  [RequestEvent.Disconnect]: () => void
  [RequestEvent.Close]: () => void
  [RequestEvent.Eose]: () => void
}

export type SingleRequestOptions = {
  relay: string
  filters: Filter[]
  signal?: AbortSignal
  context?: AdapterContext
  timeout?: number
  tracker?: Tracker
  autoClose?: boolean
  isEventValid?: (event: TrustedEvent, url: string) => boolean
  isEventDeleted?: (event: TrustedEvent, url: string) => boolean
}

export class SingleRequest extends EventEmitter {
  _ids = new Set<string>()
  _eose = new Set<string>()
  _unsubscribers: Unsubscriber[] = []
  _adapter: AbstractAdapter
  _closed = false

  constructor(readonly options: SingleRequestOptions) {
    super()

    const tracker = options.tracker || new Tracker()
    const isEventValid = options.isEventValid || netContext.isEventValid
    const isEventDeleted = options.isEventDeleted || netContext.isEventDeleted

    // Set up our adapter
    this._adapter = getAdapter(this.options.relay, this.options.context)

    // Listen for event/eose messages from the adapter
    this._unsubscribers.push(
      on(this._adapter, AdapterEvent.Receive, (message: RelayMessage, url: string) => {
        if (isRelayEvent(message)) {
          const [_, id, event] = message

          if (this._ids.has(id)) {
            if (tracker.track(event.id, url)) {
              this.emit(RequestEvent.Duplicate, event)
            } else if (isEventDeleted(event, url)) {
              this.emit(RequestEvent.Deleted, event)
            } else if (!isEventValid(event, url)) {
              this.emit(RequestEvent.Invalid, event)
            } else if (!matchFilters(this.options.filters, event)) {
              this.emit(RequestEvent.Filtered, event)
            } else {
              this.emit(RequestEvent.Event, event)
            }
          }
        }

        if (isRelayEose(message)) {
          const [_, id] = message

          if (this._ids.has(id)) {
            this._eose.add(id)

            if (this._eose.size === this._ids.size) {
              this.emit(RequestEvent.Eose)

              if (this.options.autoClose) {
                this.close()
              }
            }
          }
        }
      }),
    )

    // Listen to disconnects from any sockets
    for (const socket of this._adapter.sockets) {
      this._unsubscribers.push(
        on(socket, SocketEvent.Status, (status: SocketStatus) => {
          if (![SocketStatus.Open, SocketStatus.Opening].includes(status)) {
            this.emit(RequestEvent.Disconnect)

            if (this.options.autoClose) {
              this.close()
            }
          }
        }),
      )
    }

    // Timeout our subscription
    if (this.options.timeout || this.options.autoClose) {
      setTimeout(() => this.close(), this.options.timeout || 10000)
    }

    // Handle abort signal
    this.options.signal?.addEventListener("abort", () => this.close())

    // Start asynchronously so the caller can set up listeners
    yieldThread().then(() => {
      for (const filter of this.options.filters) {
        const id = `REQ-${randomId().slice(0, 8)}`

        this._ids.add(id)
        this._adapter.send([ClientMessageType.Req, id, filter])
      }
    })
  }

  close() {
    if (this._closed) return

    for (const id of this._ids) {
      this._adapter.send(["CLOSE", id])
    }

    this._closed = true
    this.emit(RequestEvent.Close)
    this._adapter.cleanup()
    this._unsubscribers.map(call)
    this.removeAllListeners()
  }
}

// MultiRequest

export type MultiRequestEvents = {
  [RequestEvent.Event]: (event: TrustedEvent, url: string) => void
  [RequestEvent.Deleted]: (event: TrustedEvent, url: string) => void
  [RequestEvent.Invalid]: (event: TrustedEvent, url: string) => void
  [RequestEvent.Filtered]: (event: TrustedEvent, url: string) => void
  [RequestEvent.Duplicate]: (event: TrustedEvent, url: string) => void
  [RequestEvent.Disconnect]: (url: string) => void
  [RequestEvent.Eose]: (url: string) => void
  [RequestEvent.Close]: () => void
}

export type MultiRequestOptions = Omit<SingleRequestOptions, "relay"> & {
  relays: string[]
  threshold?: number
}

export class MultiRequest extends EventEmitter {
  _children: SingleRequest[] = []
  _closed = new Set<string>()

  constructor(options: MultiRequestOptions) {
    super()

    const tracker = new Tracker()
    const relays = new Set(options.relays)
    const threshold = options.threshold || 1

    if (relays.size !== options.relays.length) {
      console.warn("Non-unique relays passed to MultiRequest")
    }

    for (const relay of relays) {
      const req = new SingleRequest({relay, tracker, ...options})

      req.on(RequestEvent.Event, (event: TrustedEvent) => {
        this.emit(RequestEvent.Event, event, relay)
      })

      req.on(RequestEvent.Deleted, (event: TrustedEvent) => {
        this.emit(RequestEvent.Deleted, event, relay)
      })

      req.on(RequestEvent.Invalid, (event: TrustedEvent) => {
        this.emit(RequestEvent.Invalid, event, relay)
      })

      req.on(RequestEvent.Filtered, (event: TrustedEvent) => {
        this.emit(RequestEvent.Filtered, event, relay)
      })

      req.on(RequestEvent.Duplicate, (event: TrustedEvent) => {
        this.emit(RequestEvent.Duplicate, event, relay)
      })

      req.on(RequestEvent.Disconnect, () => {
        this.emit(RequestEvent.Disconnect, relay)
      })

      req.on(RequestEvent.Eose, () => {
        this.emit(RequestEvent.Eose, relay)
      })

      req.on(RequestEvent.Close, () => {
        this._closed.add(relay)

        if (this._closed.size >= relays.size * threshold) {
          this.emit(RequestEvent.Close)
          this.close()
        }
      })

      this._children.push(req)
    }
  }

  close() {
    for (const child of this._children) {
      child.close()
    }
  }
}

export const request = (options: MultiRequestOptions) => new MultiRequest(options)

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
}

/**
 * Creates a convenience function which returns a promise of events from a request.
 * It may return early if filter cardinality is known, and it delays requests by
 * 200 in order to implement batching
 * @param options - MultiRequestOptions
 * @returns - a promise containing an array of TrustedEvents
 */
export const makeLoader = (options: LoaderOptions) =>
  batcher(options.delay, async (requests: LoadOptions[]) => {
    const filtersByRelay = new Map<string, Filter[]>()

    for (const {filters, relays} of requests) {
      for (const relay of relays) {
        for (const filter of filters) {
          pushToMapKey(filtersByRelay, relay, filter)
        }
      }
    }

    const tracker = new Tracker()
    const events: TrustedEvent[] = []

    await Promise.all(
      Array.from(filtersByRelay).map(
        async ([relay, unmergedFilters]) =>
          new Promise<void>(resolve => {
            const filters = unionFilters(unmergedFilters)
            const cardinality =
              filters.length === 1 ? getFilterResultCardinality(filters[0]) : undefined
            const req = new MultiRequest({
              filters,
              tracker,
              relays: [relay],
              autoClose: true,
              ...options,
            })

            let count = 0

            req.on(RequestEvent.Event, (event: TrustedEvent) => {
              events.push(event)

              if (++count === cardinality) {
                resolve()
              }
            })

            req.on(RequestEvent.Close, () => resolve())
          }),
      ),
    )

    return requests.map(r => events.filter(event => matchFilters(r.filters, event)))
  })

export const load = makeLoader({delay: 200, timeout: 3000, threshold: 0.5})
