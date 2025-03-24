import {EventEmitter} from "events"
import {on, call, randomId, yieldThread} from "@welshman/lib"
import {Filter, matchFilter, SignedEvent} from "@welshman/util"
import {RelayMessage, ClientMessageType, isRelayEvent, isRelayEose} from "./message.js"
import {getAdapter, AdapterContext, AbstractAdapter, AdapterEventType} from "./adapter.js"
import {SocketEventType, SocketStatus} from "./socket.js"
import {TypedEmitter, Unsubscriber} from "./util.js"
import {Tracker} from "./tracker.js"

export enum SubscriptionEventType {
  Close = "subscription:event:close",
  Disconnect = "subscription:event:disconnect",
  Duplicate = "subscription:event:duplicate",
  Eose = "subscription:event:eose",
  Event = "subscription:event:event",
  Filtered = "subscription:event:filtered",
  Invalid = "subscription:event:invalid",
}

export type SubscriptionEvents = {
  [SubscriptionEventType.Close]: () => void
  [SubscriptionEventType.Disconnect]: (url: string) => void
  [SubscriptionEventType.Duplicate]: (event: SignedEvent, url: string) => void
  [SubscriptionEventType.Eose]: (url: string) => void
  [SubscriptionEventType.Event]: (event: SignedEvent, url: string) => void
  [SubscriptionEventType.Filtered]: (event: SignedEvent, url: string) => void
  [SubscriptionEventType.Invalid]: (event: SignedEvent, url: string) => void
}

export type SubscriptionOptions = {
  relay: string
  filter: Filter
  context: AdapterContext
  timeout?: number
  tracker?: Tracker
  autoClose?: boolean
  verifyEvent?: (event: SignedEvent) => boolean
  on?: Partial<SubscriptionEvents>
}

export class Subscription extends (EventEmitter as new () => TypedEmitter<SubscriptionEvents>) {
  _id = `REQ-${randomId().slice(0, 8)}`
  _unsubscribers: Unsubscriber[] = []
  _adapter: AbstractAdapter
  _closed = false

  constructor(readonly options: SubscriptionOptions) {
    super()

    // Set up our adapter
    this._adapter = getAdapter(this.options.relay, this.options.context)

    // Listen for event/eose messages from the adapter
    this._unsubscribers.push(
      on(this._adapter, AdapterEventType.Receive, (message: RelayMessage, url: string) => {
        if (isRelayEvent(message)) {
          const [_, id, event] = message

          if (id !== this._id) return

          if (this.options.tracker?.track(event.id, url)) {
            this.emit(SubscriptionEventType.Duplicate, event, url)
          } else if (this.options.verifyEvent?.(event) === false) {
            this.emit(SubscriptionEventType.Invalid, event, url)
          } else if (!matchFilter(this.options.filter, event)) {
            this.emit(SubscriptionEventType.Filtered, event, url)
          } else {
            this.emit(SubscriptionEventType.Event, event, url)
          }
        }

        if (isRelayEose(message)) {
          const [_, id] = message

          if (id === this._id) {
            this.emit(SubscriptionEventType.Eose, url)

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
        on(socket, SocketEventType.Status, (status: SocketStatus) => {
          if (![SocketStatus.Open, SocketStatus.Opening].includes(status)) {
            this.emit(SubscriptionEventType.Disconnect, socket.url)

            if (this.options.autoClose) {
              this.close()
            }
          }
        }),
      )
    }

    // Register listeners
    if (this.options.on) {
      for (const [k, listener] of Object.entries(this.options.on)) {
        this.on(k as keyof SubscriptionEvents, listener)
      }
    }

    // Autostart asynchronously so the caller can set up listeners
    yieldThread().then(this.open)
  }

  open = () => {
    // Timeout our subscription
    if (this.options.timeout) {
      setTimeout(() => this.close(), this.options.timeout)
    }

    // Send our request
    this._adapter.send([ClientMessageType.Req, this._id, this.options.filter])
  }

  close() {
    if (this._closed) return

    this._adapter.send(["CLOSE", this._id])
    this.emit(SubscriptionEventType.Close)
    this.removeAllListeners()
    this._unsubscribers.map(call)
    this._adapter.cleanup()
    this._closed = true
  }
}

export const subscribe = (options: SubscriptionOptions) => new Subscription(options)
