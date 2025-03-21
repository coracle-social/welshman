import EventEmitter from "events"
import TypedEventEmitter, {EventMap} from "typed-emitter"
import {call, on} from "@welshman/lib"
import {Relay, LOCAL_RELAY_URL} from "@welshman/util"
import {RelayMessage, ClientMessage} from "./message.js"
import {Socket, SocketEventType} from "./socket.js"

type TypedEmitter<T extends EventMap> = TypedEventEmitter.default<T>

type Unsubscriber = () => void

export enum AdapterEventType {
  Receive = "adapter:event:receive",
}

export type AdapterEvents = {
  [AdapterEventType.Receive]: (message: RelayMessage, url: string) => void
}

export abstract class BaseAdapter extends (EventEmitter as new () => TypedEmitter<AdapterEvents>) {
  _unsubscribers: Unsubscriber[] = []

  abstract sockets: Socket[]
  abstract send(message: ClientMessage): void

  cleanup() {
    this._unsubscribers.splice(0).forEach(call)
  }
}

export class SocketsAdapter extends BaseAdapter {
  constructor(readonly sockets: Socket[]) {
    super()

    this._unsubscribers = sockets.map(socket => {
      return on(socket, SocketEventType.Receive, (message: RelayMessage, url: string) => {
        this.emit(AdapterEventType.Receive, message, url)
      })
    })
  }

  send(message: ClientMessage) {
    for (const socket of this.sockets) {
      socket.send(message)
    }
  }
}

export class LocalAdapter extends BaseAdapter {
  constructor(readonly relay: Relay) {
    super()

    this._unsubscribers = [
      on(relay, "*", (...message: RelayMessage) => {
        this.emit(AdapterEventType.Receive, message, LOCAL_RELAY_URL)
      }),
    ]
  }

  get sockets() {
    return []
  }

  send(message: ClientMessage) {
    const [type, ...rest] = message

    this.relay.send(type, ...rest)
  }
}

export class MultiAdapter extends BaseAdapter {
  constructor(readonly adapters: BaseAdapter[]) {
    super()

    this._unsubscribers = adapters.map(adapter => {
      return on(adapter, AdapterEventType.Receive, (message: RelayMessage, url: string) => {
        this.emit(AdapterEventType.Receive, message, url)
      })
    })
  }

  get sockets() {
    return this.adapters.flatMap(t => t.sockets)
  }

  send(message: ClientMessage) {
    for (const adapter of this.adapters) {
      adapter.send(message)
    }
  }
}
