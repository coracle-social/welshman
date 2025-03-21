import {EventEmitter} from "events"
import {on, call, randomId} from "@welshman/lib"
import {Filter, matchFilter, SignedEvent} from "@welshman/util"
import {RelayMessage, isRelayEvent, isRelayEose} from "./message.js"
import {AbstractAdapter, AdapterEventType} from "./adapter.js"
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
  adapter: AbstractAdapter
  autoClose?: boolean
  filter: Filter
  timeout?: number
  tracker?: Tracker
  verifyEvent?: (event: SignedEvent) => boolean
  events?: Partial<SubscriptionEvents>
}

export class Subscription extends (EventEmitter as new () => TypedEmitter<SubscriptionEvents>) {
  _id = `REQ-${randomId().slice(0, 8)}`
  _unsubscribers: Unsubscriber[] = []
  _closed = false

  constructor(readonly options: SubscriptionOptions) {
    super()

    const done = new Set<string>()
    const urls = new Set(options.adapter.urls)

    this._unsubscribers.push(
      on(options.adapter, AdapterEventType.Receive, (message: RelayMessage, url: string) => {
        if (isRelayEvent(message)) {
          const [_, id, event] = message

          if (id !== this._id) return

          if (options.tracker?.track(event.id, url)) {
            this.emit(SubscriptionEventType.Duplicate, event, url)
          } else if (options.verifyEvent?.(event) === false) {
            this.emit(SubscriptionEventType.Invalid, event, url)
          } else if (!matchFilter(options.filter, event)) {
            this.emit(SubscriptionEventType.Filtered, event, url)
          } else {
            this.emit(SubscriptionEventType.Event, event, url)
          }
        }

        if (isRelayEose(message)) {
          const [_, id] = message

          if (id === this._id) {
            this.emit(SubscriptionEventType.Eose, url)

            done.add(url)

            if (options.autoClose && done.size === urls.size) {
              this.close()
            }
          }
        }
      }),
    )

    for (const socket of options.adapter.sockets) {
      this._unsubscribers.push(
        on(socket, SocketEventType.Status, (status: SocketStatus) => {
          if (![SocketStatus.Open, SocketStatus.Opening].includes(status)) {
            this.emit(SubscriptionEventType.Disconnect, socket.url)

            done.add(socket.url)

            if (options.autoClose && done.size === urls.size) {
              this.close()
            }
          }
        }),
      )
    }

    if (options.timeout) {
      setTimeout(() => this.close(), options.timeout)
    }

    if (options.events) {
      for (const [k, listener] of Object.entries(options.events)) {
        this.on(k as keyof SubscriptionEvents, listener)
      }
    }

    options.adapter.send(["REQ", this._id, options.filter])
  }

  close() {
    if (this._closed) return

    this.options.adapter.send(["CLOSE", this._id])
    this.emit(SubscriptionEventType.Close)
    this.removeAllListeners()
    this._unsubscribers.map(call)
    this._closed = true
  }
}
