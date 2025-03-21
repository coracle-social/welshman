import {EventEmitter} from "events"
import {on, randomId} from "@welshman/lib"
import {Filter, SignedEvent} from "@welshman/util"
import {RelayMessage, isRelayEvent, isRelayEose} from "./message.js"
import {AbstractAdapter, AdapterEventType} from "./adapter.js"
import {TypedEmitter} from "./util.js"

export enum SubscribeEventType {
  Event = "subscribe:event:event",
  Eose = "subscribe:event:eose",
}

export type SubscribeEvents = {
  [SubscribeEventType.Event]: (event: SignedEvent, url: string) => void
  [SubscribeEventType.Eose]: (url: string) => void
}

export class Subscribe extends (EventEmitter as new () => TypedEmitter<SubscribeEvents>) {
  _id = `REQ-${randomId().slice(0, 8)}`
  _unsubscriber: () => void
  _closed = false

  constructor(
    readonly adapter: AbstractAdapter,
    readonly filter: Filter,
  ) {
    super()

    this._unsubscriber = on(
      adapter,
      AdapterEventType.Receive,
      (message: RelayMessage, url: string) => {
        if (isRelayEvent(message)) {
          const [_, id, event] = message

          if (id === this._id) {
            this.emit(SubscribeEventType.Event, event, url)
          }
        }

        if (isRelayEose(message)) {
          const [_, id] = message

          if (id === this._id) {
            this.emit(SubscribeEventType.Eose, url)
          }
        }
      },
    )

    adapter.send(["REQ", this._id, filter])
  }

  close() {
    if (this._closed) return

    this.adapter.send(["CLOSE", this._id])
    this._unsubscriber()
    this._closed = true
  }
}
