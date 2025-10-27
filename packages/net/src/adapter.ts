import EventEmitter from "events"
import {call, sleep, mergeRight, on} from "@welshman/lib"
import {isRelayUrl, matchFilters, Filter} from "@welshman/util"
import {LOCAL_RELAY_URL, Repository} from "./repository.js"
import {
  RelayMessage,
  RelayMessageType,
  ClientMessage,
  ClientMessageType,
  ClientEvent,
  ClientReq,
  ClientClose,
} from "./message.js"
import {Socket, SocketEvent} from "./socket.js"
import {Unsubscriber} from "./util.js"
import {netContext, NetContext} from "./context.js"

export enum AdapterEvent {
  Receive = "receive",
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
  subs = new Map<string, Filter[]>()

  constructor(readonly repository: Repository) {
    super()

    this._unsubscribers.push(
      on(repository, "update", ({added}) => {
        for (const [subId, filters] of this.subs.entries()) {
          for (const event of added) {
            if (matchFilters(filters, event)) {
              this.#receive([RelayMessageType.Event, subId, event])
            }
          }
        }
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
    switch (message[0]) {
      case ClientMessageType.Event:
        return this.#handleEVENT(message as ClientEvent)
      case ClientMessageType.Close:
        return this.#handleCLOSE(message as ClientClose)
      case ClientMessageType.Req:
        return this.#handleREQ(message as ClientReq)
    }
  }

  #receive(message: RelayMessage) {
    this.emit(AdapterEvent.Receive, message, LOCAL_RELAY_URL)
  }

  #handleEVENT([_, event]: ClientEvent) {
    this.repository.publish(event)

    // Callers generally expect async relays
    sleep(1).then(() => this.#receive([RelayMessageType.Ok, event.id, true, ""]))
  }

  #handleCLOSE([_, subId]: ClientClose) {
    this.subs.delete(subId)
  }

  #handleREQ([_, subId, ...filters]: ClientReq) {
    this.subs.set(subId, filters)

    // Callers generally expect async relays
    sleep(1).then(() => {
      for (const event of this.repository.query(filters)) {
        this.#receive([RelayMessageType.Event, subId, event])
      }

      this.#receive([RelayMessageType.Eose, subId])
    })
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
    return new LocalAdapter(context.repository)
  }

  if (isRelayUrl(url)) {
    return new SocketAdapter(context.pool.get(url))
  }

  throw new Error(`Invalid relay url ${url}`)
}
