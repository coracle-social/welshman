import EventEmitter from "events"
import {call, on} from "@welshman/lib"
import {Relay, LOCAL_RELAY_URL, isRelayUrl} from "@welshman/util"
import {RelayMessage, ClientMessage} from "./message.js"
import {Socket, SocketEventType} from "./socket.js"
import {TypedEmitter, Unsubscriber} from "./util.js"
import {Pool} from "./pool.js"

export enum AdapterEventType {
  Receive = "adapter:event:receive",
}

export type AdapterEvents = {
  [AdapterEventType.Receive]: (message: RelayMessage, url: string) => void
}

export abstract class AbstractAdapter extends (EventEmitter as new () => TypedEmitter<AdapterEvents>) {
  _unsubscribers: Unsubscriber[] = []

  abstract urls: string[]
  abstract sockets: Socket[]
  abstract send(message: ClientMessage): void

  cleanup() {
    this.removeAllListeners()
    this._unsubscribers.splice(0).forEach(call)
  }
}

export class SocketAdapter extends AbstractAdapter {
  constructor(readonly socket: Socket) {
    super()

    this._unsubscribers.push(
      on(socket, SocketEventType.Receive, (message: RelayMessage, url: string) => {
        this.emit(AdapterEventType.Receive, message, url)
      }),
    )
  }

  get sockets() {
    return [this.socket]
  }

  get urls() {
    return [this.socket.url]
  }

  send(message: ClientMessage) {
    this.socket.send(message)
  }
}

export class LocalAdapter extends AbstractAdapter {
  constructor(readonly relay: Relay) {
    super()

    this._unsubscribers.push(
      on(relay, "*", (...message: RelayMessage) => {
        this.emit(AdapterEventType.Receive, message, LOCAL_RELAY_URL)
      }),
    )
  }

  get sockets() {
    return []
  }

  get urls() {
    return [LOCAL_RELAY_URL]
  }

  send(message: ClientMessage) {
    const [type, ...rest] = message

    this.relay.send(type, ...rest)
  }
}

export type AdapterContext = {
  pool?: Pool
  relay?: Relay
  getAdapter?: (url: string, context: AdapterContext) => AbstractAdapter
}

export const getAdapter = (url: string, context: AdapterContext) => {
  if (context.getAdapter) {
    const adapter = context.getAdapter(url, context)

    if (adapter) {
      return adapter
    }
  }

  if (url === LOCAL_RELAY_URL) {
    if (!context.relay) {
      throw new Error(`Unable to get local relay for ${url}`)
    }

    return new LocalAdapter(context.relay)
  }

  if (isRelayUrl(url)) {
    if (!context.pool) {
      throw new Error(`Unable to get socket for ${url}`)
    }

    return new SocketAdapter(context.pool.get(url))
  }

  throw new Error(`Invalid relay url ${url}`)
}
