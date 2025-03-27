import WebSocket from "isomorphic-ws"
import {Subject, Subscription} from "rxjs"
import {webSocket, WebSocketSubject} from "rxjs/websocket"
import {RelayMessage, ClientMessage} from "./message.js"
import {Channel} from "./channel.js"

export enum SocketStatus {
  Open = "socket:status:open",
  Opening = "socket:status:opening",
  Closing = "socket:status:closing",
  Closed = "socket:status:closed",
  Error = "socket:status:error",
  Invalid = "socket:status:invalid",
}

export type SocketPolicy = (
  channel: Channel<ClientMessage, RelayMessage>,
  socket: Socket,
) => Channel<ClientMessage, RelayMessage>

export class Socket {
  _senderSubscription: Subscription

  status$ = new Subject<SocketStatus>()
  socket$: WebSocketSubject<RelayMessage>
  channel: Channel<ClientMessage, RelayMessage>

  constructor(
    readonly url: string,
    policies: SocketPolicy[],
  ) {
    this.socket$ = webSocket({
      url,
      WebSocketCtor: WebSocket as any,
      openObserver: {
        next: () => this.status$.next(SocketStatus.Open),
      },
      closeObserver: {
        next: () => this.status$.next(SocketStatus.Closed),
      },
      closingObserver: {
        next: () => this.status$.next(SocketStatus.Closing),
      },
    })

    this.channel = Channel.create<ClientMessage, RelayMessage>(this.socket$)

    for (const policy of policies) {
      this.channel = policy(this.channel, this)
    }

    this._senderSubscription = this.channel.tx$.subscribe((message: ClientMessage) =>
      this.socket$.next(message),
    )
  }

  destroy = () => {
    this.socket$.complete()
    this.status$.complete()
    this.channel.complete()
    this._senderSubscription.unsubscribe()
  }

  send = (message: ClientMessage) => {
    this.channel.next(message)
  }
}
