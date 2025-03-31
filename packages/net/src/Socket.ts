import WebSocket from "isomorphic-ws"
import EventEmitter from "events"
import {TaskQueue} from "@welshman/lib"
import {RelayMessage, ClientMessage} from "./message.js"
import {TypedEmitter} from "./util.js"

export enum SocketStatus {
  Open = "socket:status:open",
  Opening = "socket:status:opening",
  Closing = "socket:status:closing",
  Closed = "socket:status:closed",
  Error = "socket:status:error",
  Invalid = "socket:status:invalid",
}

export enum SocketEvent {
  Error = "socket:event:error",
  Status = "socket:event:status",
  Send = "socket:event:send",
  Enqueue = "socket:event:enqueue",
  Receive = "socket:event:receive",
}

export type SocketEvents = {
  [SocketEvent.Error]: (error: string, url: string) => void
  [SocketEvent.Status]: (status: SocketStatus, url: string) => void
  [SocketEvent.Send]: (message: ClientMessage, url: string) => void
  [SocketEvent.Enqueue]: (message: ClientMessage, url: string) => void
  [SocketEvent.Receive]: (message: RelayMessage, url: string) => void
}

export class Socket extends (EventEmitter as new () => TypedEmitter<SocketEvents>) {
  status = SocketStatus.Closed

  _ws?: WebSocket
  _sendQueue: TaskQueue<ClientMessage>
  _recvQueue: TaskQueue<RelayMessage>

  constructor(readonly url: string) {
    super()

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
        this.emit(SocketEvent.Status, SocketStatus.Error, this.url)
        this._sendQueue.stop()
        this._ws = undefined
      }

      this._ws.onclose = () => {
        this.emit(SocketEvent.Status, SocketStatus.Closed, this.url)
        this._sendQueue.stop()
        this._ws = undefined
      }

      this._ws.onmessage = (event: any) => {
        const data = event.data as string

        try {
          const message = JSON.parse(data)

          if (Array.isArray(message)) {
            this._recvQueue.push(message as RelayMessage)
          } else {
            this.emit(SocketEvent.Error, "Invalid message received", this.url)
          }
        } catch (e) {
          this.emit(SocketEvent.Error, "Invalid message received", this.url)
        }
      }
    } catch (e) {
      this.emit(SocketEvent.Status, SocketStatus.Invalid, this.url)
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
    this._recvQueue.clear()
    this._sendQueue.clear()
    this.removeAllListeners()
  }

  send = (message: ClientMessage) => {
    this._sendQueue.push(message)
    this.emit(SocketEvent.Enqueue, message, this.url)
  }
}
