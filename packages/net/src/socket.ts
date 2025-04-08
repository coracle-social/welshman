import WebSocket from "isomorphic-ws"
import EventEmitter from "events"
import {TaskQueue} from "@welshman/lib"
import {RelayMessage, ClientMessage} from "./message.js"
import {AuthState} from "./auth.js"

export enum SocketStatus {
  Open = "socket:status:open",
  Opening = "socket:status:opening",
  Closing = "socket:status:closing",
  Closed = "socket:status:closed",
  Error = "socket:status:error",
}

export enum SocketEvent {
  Error = "socket:event:error",
  Status = "socket:event:status",
  Send = "socket:event:send",
  Sending = "socket:event:sending",
  Receive = "socket:event:receive",
  Receiving = "socket:event:receiving",
}

export type SocketEvents = {
  [SocketEvent.Error]: (error: string, url: string) => void
  [SocketEvent.Status]: (status: SocketStatus, url: string) => void
  [SocketEvent.Send]: (message: ClientMessage, url: string) => void
  [SocketEvent.Sending]: (message: ClientMessage, url: string) => void
  [SocketEvent.Receive]: (message: RelayMessage, url: string) => void
  [SocketEvent.Receiving]: (message: RelayMessage, url: string) => void
}

export class Socket extends EventEmitter {
  auth: AuthState
  status = SocketStatus.Closed

  _ws?: WebSocket
  _sendQueue: TaskQueue<ClientMessage>
  _recvQueue: TaskQueue<RelayMessage>

  constructor(readonly url: string) {
    super()

    this.auth = new AuthState(this)

    this._sendQueue = new TaskQueue<ClientMessage>({
      batchSize: 50,
      processItem: (message: ClientMessage) => {
        this._ws?.send(JSON.stringify(message))
        this.emit(SocketEvent.Send, message, this.url)
      },
    })

    this._recvQueue = new TaskQueue<RelayMessage>({
      batchSize: 50,
      processItem: (message: RelayMessage) => {
        this.emit(SocketEvent.Receive, message, this.url)
      },
    })

    this.on(SocketEvent.Status, (status: SocketStatus) => {
      this.status = status
    })

    this._sendQueue.stop()
    this.setMaxListeners(1000)
  }

  open = () => {
    if (this._ws) {
      throw new Error("Attempted to open a websocket that has not been closed")
    }

    try {
      this._ws = new WebSocket(this.url)
      this.emit(SocketEvent.Status, SocketStatus.Opening, this.url)

      this._ws.onopen = () => {
        this.emit(SocketEvent.Status, SocketStatus.Open, this.url)
        this._sendQueue.start()
      }

      this._ws.onerror = () => {
        this._ws = undefined
        this._sendQueue.stop()
        this.emit(SocketEvent.Status, SocketStatus.Error, this.url)
      }

      this._ws.onclose = () => {
        this._ws = undefined
        this._sendQueue.stop()
        this.emit(SocketEvent.Status, SocketStatus.Closed, this.url)
      }

      this._ws.onmessage = (event: any) => {
        const data = event.data as string

        try {
          const message = JSON.parse(data)

          if (Array.isArray(message)) {
            this._recvQueue.push(message as RelayMessage)
            this.emit(SocketEvent.Receiving, message, this.url)
          } else {
            this.emit(SocketEvent.Error, "Invalid message received", this.url)
          }
        } catch (e) {
          this.emit(SocketEvent.Error, "Invalid message received", this.url)
        }
      }
    } catch (e) {
      this.emit(SocketEvent.Status, SocketStatus.Error, this.url)
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

  cleanup = () => {
    this.close()
    this.auth.cleanup()
    this._recvQueue.clear()
    this._sendQueue.clear()
    this.removeAllListeners()
  }

  send = (message: ClientMessage) => {
    this._sendQueue.push(message)
    this.emit(SocketEvent.Sending, message, this.url)
  }
}
