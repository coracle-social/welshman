import {map, share, Observable} from "rxjs"
import {Relay, LOCAL_RELAY_URL, isRelayUrl} from "@welshman/util"
import {RelayMessage, ClientMessage} from "./message.js"
import {Socket} from "./socket.js"
import {Pool} from "./pool.js"

export type AdapterMessage = {
  message: RelayMessage
  url: string
}

export interface Adapter {
  urls: string[]
  sockets: Socket[]
  send(message: ClientMessage): void
  recv$: Observable<AdapterMessage>
}

export class SocketAdapter implements Adapter {
  recv$: Observable<AdapterMessage>

  constructor(readonly socket: Socket) {
    this.recv$ = socket.recv$.pipe(
      map(message => ({message, url: socket.url})),
      share(),
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

export class LocalAdapter implements Adapter {
  recv$: Observable<AdapterMessage>

  constructor(readonly relay: Relay) {
    this.recv$ = new Observable<AdapterMessage>(subscriber => {
      const handler = (...message: RelayMessage) => {
        subscriber.next({message, url: LOCAL_RELAY_URL})
      }

      relay.on("*", handler)

      return () => {
        relay.off("*", handler)
      }
    }).pipe(share())
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
  getAdapter?: (url: string, context: AdapterContext) => Adapter
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
