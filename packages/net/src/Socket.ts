import WebSocket from "isomorphic-ws"
import {Worker, sleep} from '@welshman/lib'
import {ConnectionEvent} from './ConnectionEvent'
import type {Connection} from './Connection'

export type Message = [string, ...any[]]

export enum SocketStatus {
  New = 'new',
  Open = 'open',
  Opening = 'opening',
  Closing = 'closing',
  Closed = 'closed',
  Error = 'error',
  Invalid = 'invalid',
}

const {
  New,
  Open,
  Opening,
  Closing,
  Closed,
  Error,
  Invalid,
} = SocketStatus

export class Socket {
  status = SocketStatus.New
  worker = new Worker<Message>()
  ws?: WebSocket

  constructor(readonly cxn: Connection) {
    // Use a worker to throttle incoming data
    this.worker.addGlobalHandler((message: Message) => {
      this.cxn.emit(ConnectionEvent.Receive, message)
    })
  }

  wait = async () => {
    while ([Opening, Closing].includes(this.status)) {
      await sleep(100)
    }
  }

  open = async () => {
    // If we're in a provisional state, wait
    await this.wait()

    // If the socket is closed, reset
    if (this.status === Closed) {
      this.status = New
      this.cxn.emit(ConnectionEvent.Reset)
    }

    // If the socket is new, connect
    if (this.status === New) {
      this.#init()
    }

    // Wait until we're connected (or fail to connect)
    await this.wait()
  }

  close = async () => {
    if (this.cxn.url === 'wss://filter.nostr.wine/') {
      console.trace('closing')
    }
    this.worker.pause()
    this.ws?.close()

    // Allow the socket to start closing before waiting
    await sleep(100)

    // Wait for the socket to fully clos
    await this.wait()

    this.ws = undefined
  }

  send = async (message: Message) => {
    await this.open()

    this.cxn.emit(ConnectionEvent.Send, message)
    this.ws.send(JSON.stringify(message))
  }

  #init = () => {
    try {
      this.ws = new WebSocket(this.cxn.url)
      this.status = Opening

      this.ws.onopen = () => {
        this.status = Open
        this.cxn.emit(ConnectionEvent.Open)
      }

      this.ws.onerror = () => {
        this.status = Error
        this.cxn.emit(ConnectionEvent.Error)
      }

      this.ws.onclose = () => {
        if (this.status !== Error) {
          this.status = Closed
        }

        this.cxn.emit(ConnectionEvent.Close)
      }

      this.ws.onmessage = (event: {data: string}) => {
        try {
          const message = JSON.parse(event.data as string)

          if (Array.isArray(message)) {
            this.worker.push(message as Message)
          } else {
            this.cxn.emit(ConnectionEvent.InvalidMessage, event.data)
          }
        } catch (e) {
          this.cxn.emit(ConnectionEvent.InvalidMessage, event.data)
        }
      }
    } catch (e) {
      this.status = Invalid
      this.cxn.emit(ConnectionEvent.InvalidUrl)
    }
  }
}
