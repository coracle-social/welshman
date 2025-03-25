import {Subscription} from "rxjs"
import {EventEmitter} from "events"
import {randomId, yieldThread} from "@welshman/lib"
import {Filter, matchFilter, SignedEvent} from "@welshman/util"
import {ClientMessageType, isRelayEvent, isRelayEose} from "./message.js"
import {getAdapter, AdapterContext, Adapter} from "./adapter.js"
import {SocketStatus} from "./socket.js"
import {TypedEmitter} from "./util.js"
import {Tracker} from "./tracker.js"

export enum RequestEventType {
  Close = "request:event:close",
  Disconnect = "request:event:disconnect",
  Duplicate = "request:event:duplicate",
  Eose = "request:event:eose",
  Event = "request:event:event",
  Filtered = "request:event:filtered",
  Invalid = "request:event:invalid",
}

// Unireq

export type UnireqEvents = {
  [RequestEventType.Event]: (event: SignedEvent) => void
  [RequestEventType.Invalid]: (event: SignedEvent) => void
  [RequestEventType.Filtered]: (event: SignedEvent) => void
  [RequestEventType.Duplicate]: (event: SignedEvent) => void
  [RequestEventType.Disconnect]: () => void
  [RequestEventType.Close]: () => void
  [RequestEventType.Eose]: () => void
}

export type UnireqOptions = {
  relay: string
  filter: Filter
  context: AdapterContext
  timeout?: number
  tracker?: Tracker
  autoClose?: boolean
  verifyEvent?: (event: SignedEvent) => boolean
}

export class Unireq extends (EventEmitter as new () => TypedEmitter<UnireqEvents>) {
  _id = `REQ-${randomId().slice(0, 8)}`
  _subscriptions: Subscription[] = []
  _adapter: Adapter
  _closed = false

  constructor(readonly options: UnireqOptions) {
    super()

    // Set up our adapter
    this._adapter = getAdapter(this.options.relay, this.options.context)

    // Listen for event/eose messages from the adapter
    this._subscriptions.push(
      this._adapter.recv$.subscribe(({message, url}) => {
        if (isRelayEvent(message)) {
          const [_, id, event] = message

          if (id !== this._id) return

          if (this.options.tracker?.track(event.id, url)) {
            this.emit(RequestEventType.Duplicate, event)
          } else if (this.options.verifyEvent?.(event) === false) {
            this.emit(RequestEventType.Invalid, event)
          } else if (!matchFilter(this.options.filter, event)) {
            this.emit(RequestEventType.Filtered, event)
          } else {
            this.emit(RequestEventType.Event, event)
          }
        }

        if (isRelayEose(message)) {
          const [_, id] = message

          if (id === this._id) {
            this.emit(RequestEventType.Eose)

            if (this.options.autoClose) {
              this.close()
            }
          }
        }
      }),
    )

    // Listen to disconnects from any sockets
    for (const socket of this._adapter.sockets) {
      this._subscriptions.push(
        socket.status$.subscribe((status: SocketStatus) => {
          if (![SocketStatus.Open, SocketStatus.Opening].includes(status)) {
            this.emit(RequestEventType.Disconnect)

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
    this.emit(RequestEventType.Close)
    this.removeAllListeners()
    this._subscriptions.forEach(sub => sub.unsubscribe())
    this._closed = true
  }
}

// Multireq

export type MultireqEvents = {
  [RequestEventType.Event]: (event: SignedEvent, url: string) => void
  [RequestEventType.Invalid]: (event: SignedEvent, url: string) => void
  [RequestEventType.Filtered]: (event: SignedEvent, url: string) => void
  [RequestEventType.Duplicate]: (event: SignedEvent, url: string) => void
  [RequestEventType.Disconnect]: (url: string) => void
  [RequestEventType.Eose]: (url: string) => void
  [RequestEventType.Close]: () => void
}

export type MultireqOptions = Omit<UnireqOptions, "relay"> & {
  relays: string[]
}

export class Multireq extends (EventEmitter as new () => TypedEmitter<MultireqEvents>) {
  _children: Unireq[] = []
  _closed = new Set<string>()

  constructor({relays, ...options}: MultireqOptions) {
    super()

    for (const relay of relays) {
      const req = new Unireq({relay, ...options})

      req.on(RequestEventType.Event, (event: SignedEvent) => {
        this.emit(RequestEventType.Event, event, relay)
      })

      req.on(RequestEventType.Invalid, (event: SignedEvent) => {
        this.emit(RequestEventType.Invalid, event, relay)
      })

      req.on(RequestEventType.Filtered, (event: SignedEvent) => {
        this.emit(RequestEventType.Filtered, event, relay)
      })

      req.on(RequestEventType.Duplicate, (event: SignedEvent) => {
        this.emit(RequestEventType.Duplicate, event, relay)
      })

      req.on(RequestEventType.Disconnect, () => {
        this.emit(RequestEventType.Disconnect, relay)
      })

      req.on(RequestEventType.Eose, () => {
        this.emit(RequestEventType.Eose, relay)
      })

      req.on(RequestEventType.Close, () => {
        this._closed.add(relay)

        if (this._closed.size === relays.length) {
          this.emit(RequestEventType.Close)
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

// Convenience functions

export const unireq = (options: UnireqOptions) => new Unireq(options)

export const multireq = (options: MultireqOptions) => new Multireq(options)
