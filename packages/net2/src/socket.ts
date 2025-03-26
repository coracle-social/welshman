import WebSocket from "isomorphic-ws"
import {Subject, Subscription, takeUntil, observeOn, asapScheduler} from "rxjs"
import {RelayMessage, ClientMessage} from "./message.js"

export enum SocketStatus {
  Open = "socket:status:open",
  Opening = "socket:status:opening",
  Closing = "socket:status:closing",
  Closed = "socket:status:closed",
  Error = "socket:status:error",
  Invalid = "socket:status:invalid",
}

export type SocketPolicy = (socket: Socket) => Subscription

export class Socket {
  _ws?: WebSocket
  _subs: Subscription[] = []
  _destroy$ = new Subject<void>()
  _errorSubject = new Subject<string>()
  _statusSubject = new Subject<SocketStatus>()
  _sendSubject = new Subject<ClientMessage>()
  _recvSubject = new Subject<RelayMessage>()

  error$ = this._errorSubject.asObservable().pipe(takeUntil(this._destroy$))
  status$ = this._statusSubject.asObservable().pipe(takeUntil(this._destroy$))
  send$ = this._sendSubject.asObservable().pipe(observeOn(asapScheduler), takeUntil(this._destroy$))
  recv$ = this._recvSubject.asObservable().pipe(observeOn(asapScheduler), takeUntil(this._destroy$))

  constructor(
    readonly url: string,
    policies: SocketPolicy[] = [],
  ) {
    this.send$.subscribe((message: ClientMessage) => {
      this._ws?.send(JSON.stringify(message))
    })

    for (const policy of policies) {
      this._subs.push(policy(this))
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

  destroy = () => {
    this.close()
    this._destroy$.next()
    this._destroy$.complete()
    this._sendSubject.complete()
    this._recvSubject.complete()
    this._errorSubject.complete()
    this._statusSubject.complete()
    this._subs.forEach(sub => sub.unsubscribe())
  }

  send = (message: ClientMessage) => {
    this._sendSubject.next(message)
  }
}
