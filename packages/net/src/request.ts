import {EventEmitter} from "events"
import {on, call, randomId, yieldThread, pushToMapKey, batcher} from "@welshman/lib"
import {
  Filter,
  unionFilters,
  matchFilter,
  TrustedEvent,
  getFilterResultCardinality,
  verifyEvent as defaultVerifyEvent,
} from "@welshman/util"
import {RelayMessage, ClientMessageType, isRelayEvent, isRelayEose} from "./message.js"
import {getAdapter, AdapterContext, AbstractAdapter, AdapterEvent} from "./adapter.js"
import {SocketEvent, SocketStatus} from "./socket.js"
import {TypedEmitter, Unsubscriber} from "./util.js"
import {Tracker} from "./tracker.js"

export enum RequestEvent {
  Close = "request:event:close",
  Disconnect = "request:event:disconnect",
  Duplicate = "request:event:duplicate",
  Eose = "request:event:eose",
  Event = "request:event:event",
  Filtered = "request:event:filtered",
  Invalid = "request:event:invalid",
}

// SingleRequest

export type SingleRequestEvents = {
  [RequestEvent.Event]: (event: TrustedEvent) => void
  [RequestEvent.Invalid]: (event: any) => void
  [RequestEvent.Filtered]: (event: TrustedEvent) => void
  [RequestEvent.Duplicate]: (event: TrustedEvent) => void
  [RequestEvent.Disconnect]: () => void
  [RequestEvent.Close]: () => void
  [RequestEvent.Eose]: () => void
}

export type SingleRequestOptions = {
  relay: string
  filter: Filter
  context?: AdapterContext
  timeout?: number
  tracker?: Tracker
  autoClose?: boolean
  verifyEvent?: (event: any) => boolean
}

export class SingleRequest extends (EventEmitter as new () => TypedEmitter<SingleRequestEvents>) {
  _id = `REQ-${randomId().slice(0, 8)}`
  _unsubscribers: Unsubscriber[] = []
  _adapter: AbstractAdapter
  _closed = false

  constructor(readonly options: SingleRequestOptions) {
    super()

    const tracker = options.tracker || new Tracker()

    const verifyEvent = options.verifyEvent || defaultVerifyEvent

    // Set up our adapter
    this._adapter = getAdapter(this.options.relay, this.options.context)

    // Listen for event/eose messages from the adapter
    this._unsubscribers.push(
      on(this._adapter, AdapterEvent.Receive, (message: RelayMessage, url: string) => {
        if (isRelayEvent(message)) {
          const [_, id, event] = message

          if (id !== this._id) return

          if (tracker.track(event.id, url)) {
            this.emit(RequestEvent.Duplicate, event)
          } else if (verifyEvent?.(event) === false) {
            this.emit(RequestEvent.Invalid, event)
          } else if (!matchFilter(this.options.filter, event)) {
            this.emit(RequestEvent.Filtered, event)
          } else {
            this.emit(RequestEvent.Event, event)
          }
        }

        if (isRelayEose(message)) {
          const [_, id] = message

          if (id === this._id) {
            this.emit(RequestEvent.Eose)

            if (this.options.autoClose) {
              this.close()
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
    if (this.options.timeout) {
      setTimeout(() => this.close(), this.options.timeout)
    }

    // Start asynchronously so the caller can set up listeners
    yieldThread().then(() => {
      this._adapter.send([ClientMessageType.Req, this._id, this.options.filter])
    })
  }

  close() {
    if (this._closed) return

    this._adapter.send(["CLOSE", this._id])
    this.emit(RequestEvent.Close)
    this.removeAllListeners()
    this._unsubscribers.map(call)
    this._adapter.cleanup()
    this._closed = true
  }
}

// MultiRequest

export type MultiRequestEvents = {
  [RequestEvent.Event]: (event: TrustedEvent, url: string) => void
  [RequestEvent.Invalid]: (event: TrustedEvent, url: string) => void
  [RequestEvent.Filtered]: (event: TrustedEvent, url: string) => void
  [RequestEvent.Duplicate]: (event: TrustedEvent, url: string) => void
  [RequestEvent.Disconnect]: (url: string) => void
  [RequestEvent.Eose]: (url: string) => void
  [RequestEvent.Close]: () => void
}

export type MultiRequestOptions = Omit<SingleRequestOptions, "relay"> & {
  relays: string[]
}

export class MultiRequest extends (EventEmitter as new () => TypedEmitter<MultiRequestEvents>) {
  _children: SingleRequest[] = []
  _closed = new Set<string>()

  constructor({relays, ...options}: MultiRequestOptions) {
    super()

    const tracker = new Tracker()

    for (const relay of relays) {
      const req = new SingleRequest({relay, tracker, ...options})

      req.on(RequestEvent.Event, (event: TrustedEvent) => {
        this.emit(RequestEvent.Event, event, relay)
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

        if (this._closed.size === relays.length) {
          this.emit(RequestEvent.Close)
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

/**
 * A convenience function which returns a promise of events from a request.
 * It may return early if filter cardinality is known, and it delays requests by
 * 200 in order to implement batching
 * @param options - MultiRequestOptions
 * @returns - a promise containing an array of TrustedEvents
 */
export const load = batcher(200, async (requests: MultiRequestOptions[]) => {
  const filtersByRelay = new Map<string, Filter[]>()

  for (const {filter, relays} of requests) {
    for (const relay of relays) {
      pushToMapKey(filtersByRelay, relay, filter)
    }
  }

  const tracker = new Tracker()
  const events: TrustedEvent[] = []

  await Promise.all(
    Array.from(filtersByRelay).map(async ([relay, filters]) => {
      await Promise.all(
        unionFilters(filters).map(filter => {
          new Promise<void>(resolve => {
            const cardinality = getFilterResultCardinality(filter)
            const req = new MultiRequest({
              filter,
              tracker,
              relays: [relay],
              timeout: 5000,
              autoClose: true,
            })

            let count = 0

            req.on(RequestEvent.Event, (event: TrustedEvent) => {
              events.push(event)

              if (++count === cardinality) {
                resolve()
              }
            })

            req.on(RequestEvent.Close, () => resolve())
          })
        }),
      )
    }),
  )

  return requests.map(r => events.filter(event => matchFilter(r.filter, event)))
})
