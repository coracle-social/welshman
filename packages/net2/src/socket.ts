import WebSocket from "isomorphic-ws"
import {Subject, observeOn, asapScheduler, Observable} from "rxjs"
import {RelayMessage, ClientMessage} from "./message.js"

export enum SocketStatus {
  Open = "socket:status:open",
  Opening = "socket:status:opening",
  Closing = "socket:status:closing",
  Closed = "socket:status:closed",
  Error = "socket:status:error",
  Invalid = "socket:status:invalid",
}

export type SocketPolicy = (socket: Socket) => void

export class Socket {
  _ws?: WebSocket
  _errorSubject = new Subject<string>()
  _statusSubject = new Subject<SocketStatus>()
  _sendSubject = new Subject<ClientMessage>()
  _recvSubject = new Subject<RelayMessage>()

  error$ = this._errorSubject.asObservable()
  status$ = this._statusSubject.asObservable()
  send$: Observable<ClientMessage> = this._sendSubject.asObservable().pipe(observeOn(asapScheduler))
  recv$ = this._recvSubject.asObservable().pipe(observeOn(asapScheduler))

  constructor(
    readonly url: string,
    policies: SocketPolicy[] = [],
  ) {
    this.send$.subscribe((message: ClientMessage) => {
      this._ws?.send(JSON.stringify(message))
    })

    for (const policy of policies) {
      policy(this)
    }
  }

  open = () => {
    if (this._ws) {
      throw new Error("Attempted to open a websocket that has not been closed")
    }

    try {
      this._ws = new WebSocket(this.url)
      this._statusSubject.next(SocketStatus.Opening)

      this._ws.onopen = () => {
        this._statusSubject.next(SocketStatus.Open)
      }

      this._ws.onerror = () => {
        this._statusSubject.next(SocketStatus.Error)
        this._ws = undefined
      }

      this._ws.onclose = () => {
        this._statusSubject.next(SocketStatus.Closed)
        this._ws = undefined
      }

      this._ws.onmessage = (event: any) => {
        const data = event.data as string

        try {
          const message = JSON.parse(data)

          if (Array.isArray(message)) {
            this._recvSubject.next(message as RelayMessage)
          } else {
            this._errorSubject.next("Invalid message received")
          }
        } catch (e) {
          this._errorSubject.next("Invalid message received")
        }
      }
    } catch (e) {
      this._statusSubject.next(SocketStatus.Invalid)
    }
  }

  attemptToOpen = () => {
    if (!this._ws) {
      this.open()
    }
  }

  close = () => {
    this._ws?.close()
    this._ws = undefined
  }

  complete = () => {
    this.close()
    this._sendSubject.complete()
    this._recvSubject.complete()
    this._errorSubject.complete()
    this._statusSubject.complete()
  }

  send = (message: ClientMessage) => {
    this._sendSubject.next(message)
  }
}
