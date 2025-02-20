import WebSocket from "isomorphic-ws"
import {Worker, sleep} from "@welshman/lib"
import {ConnectionEvent} from "./ConnectionEvent.js"
import type {Connection} from "./Connection.js"

export type Message = [string, ...any[]]

export enum SocketStatus {
  New = "new",
  Open = "open",
  Opening = "opening",
  Closing = "closing",
  Closed = "closed",
  Error = "error",
  Invalid = "invalid",
}

export class Socket {
  lastError = 0
  status = SocketStatus.New
  worker = new Worker<Message>()
  ws?: WebSocket

  constructor(readonly cxn: Connection) {
    // Use a worker to throttle incoming data
    this.worker.addGlobalHandler((message: Message) => {
      this.cxn.emit(ConnectionEvent.Receive, message)
    })
  }

  wait = async (timeout = 300) => {
    const start = Date.now()
    while (
      Date.now() - timeout <= start &&
      [SocketStatus.Opening, SocketStatus.Closing].includes(this.status)
    ) {
      await sleep(100)
    }
  }

  open = async () => {
    // If we're in a provisional state, wait
    await this.wait()

    // If the socket is closed, reset
    if (this.status === SocketStatus.Closed) {
      this.status = SocketStatus.New
      this.cxn.emit(ConnectionEvent.Reset)
    }

    // If we're closed due to an error retry after a delay
    if (this.status === SocketStatus.Error && Date.now() - this.lastError > 15_000) {
      this.status = SocketStatus.New
      this.cxn.emit(ConnectionEvent.Reset)
    }

    // If the socket is new, connect
    if (this.status === SocketStatus.New) {
      this.#init()
    }

    // Wait until we're connected (or fail to connect)
    await this.wait()
  }

  close = async () => {
    this.worker.pause()
    this.ws?.close()
    this.ws = undefined

    // Allow the socket to start closing before waiting
    await sleep(100)

    // Wait for the socket to fully close
    await this.wait()
  }

  send = async (message: Message) => {
    await this.open()

    if (!this.ws) {
      throw new Error(`No websocket available when sending to ${this.cxn.url}`)
    }

    this.cxn.emit(ConnectionEvent.Send, message)
    this.ws.send(JSON.stringify(message))
  }

  #init = () => {
    try {
      this.ws = new WebSocket(this.cxn.url)
      this.status = SocketStatus.Opening

      this.ws.onopen = () => {
        this.status = SocketStatus.Open
        this.cxn.emit(ConnectionEvent.Open)
      }

      this.ws.onerror = () => {
        this.status = SocketStatus.Error
        this.lastError = Date.now()
        this.cxn.emit(ConnectionEvent.Error)
      }

      this.ws.onclose = () => {
        if (this.status !== SocketStatus.Error) {
          this.status = SocketStatus.Closed
        }

        this.cxn.emit(ConnectionEvent.Close)
      }

      this.ws.onmessage = (event: any) => {
        const data = event.data as string

        try {
          const message = JSON.parse(data)

          if (Array.isArray(message)) {
            this.worker.push(message as Message)
          } else {
            this.cxn.emit(ConnectionEvent.InvalidMessage, data)
          }
        } catch (e) {
          this.cxn.emit(ConnectionEvent.InvalidMessage, data)
        }
      }
    } catch (e) {
      this.lastError = Date.now()
      this.status = SocketStatus.Invalid
      this.cxn.emit(ConnectionEvent.InvalidUrl)
    }
  }
}
