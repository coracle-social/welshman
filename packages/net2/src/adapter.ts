import {eq, on, call} from "@welshman/lib"
import {Relay} from "@welshman/util"
import {RelayMessage, ClientMessage} from "./message.js"
import {Socket} from "./socket.js"

type Unsubscriber = () => void

const trackUnsubscribers = (all: Unsubscriber[], local: Unsubscriber[]) => {
  all.push(...local)

  return () => {
    local.forEach(call)

    for (const f of local) {
      all.splice(all.findIndex(eq(f)), 1)
    }
  }
}

type RelayMessageSub = (message: RelayMessage) => void

export interface IAdapter {
  sockets: Socket[]
  send(message: ClientMessage): void
  onMessage(cb: RelayMessageSub): Unsubscriber
}

export class SocketsAdapter implements IAdapter {
  _unsubscribers: Unsubscriber[] = []

  constructor(readonly sockets: Socket[]) {}

  send(message: ClientMessage) {
    for (const socket of this.sockets) {
      socket.send(message)
    }
  }

  onMessage(cb: RelayMessageSub) {
    return trackUnsubscribers(
      this._unsubscribers,
      this.sockets.map(s => s.onMessage(cb)),
    )
  }

  cleanup() {
    this._unsubscribers.splice(0).forEach(call)
  }
}

export class LocalAdapter {
  _unsubscribers: Unsubscriber[] = []

  constructor(readonly relay: Relay) {}

  get sockets() {
    return []
  }

  send(message: ClientMessage) {
    const [type, ...rest] = message

    this.relay.send(type, ...rest)
  }

  onMessage(cb: RelayMessageSub) {
    return trackUnsubscribers(this._unsubscribers, [
      on(this.relay, "*", (...args: any[]) => cb(args)),
    ])
  }

  cleanup() {
    this._unsubscribers.splice(0).forEach(call)
  }
}

export class MultiAdapter {
  _unsubscribers: Unsubscriber[] = []

  constructor(readonly adapters: IAdapter[]) {}

  get sockets() {
    return this.adapters.flatMap(t => t.sockets)
  }

  send(message: ClientMessage) {
    for (const adapter of this.adapters) {
      adapter.send(message)
    }
  }

  onMessage(cb: RelayMessageSub) {
    return trackUnsubscribers(
      this._unsubscribers,
      this.adapters.map(a => a.onMessage(cb)),
    )
  }

  cleanup() {
    this._unsubscribers.splice(0).forEach(call)
  }
}
