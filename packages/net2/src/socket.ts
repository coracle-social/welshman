import WebSocket from "isomorphic-ws"
import EventEmitter from "events"
import {on, now, ago, TaskQueue} from "@welshman/lib"
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

export enum SocketEventType {
  Error = "socket:event:error",
  Status = "socket:event:status",
  Send = "socket:event:send",
  Receive = "socket:event:receive",
}

export type SocketEvents = {
  [SocketEventType.Error]: (error: string, url: string) => void
  [SocketEventType.Status]: (status: SocketStatus, url: string) => void
  [SocketEventType.Send]: (message: ClientMessage, url: string) => void
  [SocketEventType.Receive]: (message: RelayMessage, url: string) => void
}

export type SocketUnsubscriber = () => void

export class Socket extends (EventEmitter as new () => TypedEmitter<SocketEvents>) {
  _ws?: WebSocket
  _sendQueue: TaskQueue<ClientMessage>
  _recvQueue: TaskQueue<RelayMessage>

  constructor(readonly url: string) {
    super()

    this._sendQueue = new TaskQueue<ClientMessage>({
      batchSize: 50,
      processItem: (message: ClientMessage) => {
        this._ws?.send(JSON.stringify(message))
        this.emit(SocketEventType.Send, message, this.url)
      },
    })

    this._recvQueue = new TaskQueue<RelayMessage>({
      batchSize: 50,
      processItem: (message: RelayMessage) => {
        this.emit(SocketEventType.Receive, message, this.url)
      },
    })
  }

  open = () => {
    if (this._ws) {
      throw new Error("Attempted to open a websocket that has not been closed")
    }

    try {
      this._ws = new WebSocket(this.url)
      this.emit(SocketEventType.Status, SocketStatus.Opening, this.url)

      this._ws.onopen = () => this.emit(SocketEventType.Status, SocketStatus.Open, this.url)

      this._ws.onerror = () => {
        this.emit(SocketEventType.Status, SocketStatus.Error, this.url)
        this._ws = undefined
      }

      this._ws.onclose = () => {
        this.emit(SocketEventType.Status, SocketStatus.Closed, this.url)
        this._ws = undefined
      }

      this._ws.onmessage = (event: any) => {
        const data = event.data as string

        try {
          const message = JSON.parse(data)

          if (Array.isArray(message)) {
            this._recvQueue.push(message as RelayMessage)
          } else {
            this.emit(SocketEventType.Error, "Invalid message received", this.url)
          }
        } catch (e) {
          this.emit(SocketEventType.Error, "Invalid message received", this.url)
        }
      }
    } catch (e) {
      this.emit(SocketEventType.Status, SocketStatus.Invalid, this.url)
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
  }

  send = (message: ClientMessage) => {
    this._sendQueue.push(message)
  }
}

export const socketPolicySendWhenOpen = (socket: Socket) => {
  // Pause sending messages when the socket isn't open
  const unsubscribe = on(socket, SocketEventType.Status, newStatus => {
    if (newStatus === SocketStatus.Open) {
      socket._sendQueue.start()
    } else {
      socket._sendQueue.stop()
    }
  })

  return unsubscribe
}

export const socketPolicyConnectOnSend = (socket: Socket) => {
  let lastError = 0
  let currentStatus = SocketStatus.Closed

  const unsubscribeOnStatus = on(socket, SocketEventType.Status, (newStatus: SocketStatus) => {
    // Keep track of the most recent error
    if (newStatus === SocketStatus.Error) {
      lastError = now()
    }

    // Keep track of the current status
    currentStatus = newStatus
  })

  const unsubscribeOnSend = on(socket, SocketEventType.Send, (message: ClientMessage) => {
    // When a new message is sent, make sure the socket is open (unless there was a recent error)
    if (currentStatus === SocketStatus.Closed && now() - lastError < ago(30)) {
      socket.open()
    }
  })

  return () => {
    unsubscribeOnStatus()
    unsubscribeOnSend()
  }
}

export const defaultSocketPolicies = [socketPolicySendWhenOpen, socketPolicyConnectOnSend]

export const makeSocket = (url: string, policies = defaultSocketPolicies) => {
  const socket = new Socket(url)

  for (const applyPolicy of defaultSocketPolicies) {
    applyPolicy(socket)
  }

  return socket
}
