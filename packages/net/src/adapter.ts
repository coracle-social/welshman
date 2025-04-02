import EventEmitter from "events"
import {call, mergeRight, on} from "@welshman/lib"
import {isRelayUrl} from "@welshman/util"
import {LocalRelay, LOCAL_RELAY_URL} from "@welshman/relay"
import {RelayMessage, ClientMessage} from "./message.js"
import {Socket, SocketEvent} from "./socket.js"
import {Unsubscriber} from "./util.js"
import {netContext, NetContext} from "./context.js"

export enum AdapterEvent {
  Receive = "adapter:event:receive",
}

export type AdapterEvents = {
  [AdapterEvent.Receive]: (message: RelayMessage, url: string) => void
}

export abstract class AbstractAdapter extends EventEmitter {
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
      on(socket, SocketEvent.Receive, (message: RelayMessage, url: string) => {
        this.emit(AdapterEvent.Receive, message, url)
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
  constructor(readonly relay: LocalRelay) {
    super()

    this._unsubscribers.push(
      on(relay, "*", (...message: RelayMessage) => {
        this.emit(AdapterEvent.Receive, message, LOCAL_RELAY_URL)
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

export class MockAdapter extends AbstractAdapter {
  constructor(
    readonly url: string,
    readonly send: (message: ClientMessage) => void,
  ) {
    super()
  }

  get sockets() {
    return []
  }

  get urls() {
    return [this.url]
  }

  receive = (message: RelayMessage) => {
    this.emit(AdapterEvent.Receive, message, this.url)
  }
}

export type AdapterContext = Partial<NetContext>

export const getAdapter = (url: string, adapterContext: AdapterContext = {}) => {
  const context = mergeRight(netContext, adapterContext as any)

  if (context.getAdapter) {
    const adapter = context.getAdapter(url, context)

    if (adapter) {
      return adapter
    }
  }

  if (url === LOCAL_RELAY_URL) {
    return new LocalAdapter(new LocalRelay(context.repository))
  }

  if (isRelayUrl(url)) {
    return new SocketAdapter(context.pool.get(url))
  }

  throw new Error(`Invalid relay url ${url}`)
}
