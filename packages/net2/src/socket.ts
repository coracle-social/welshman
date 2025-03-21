import WebSocket from "isomorphic-ws"
import {remove, now, ago, TaskQueue} from "@welshman/lib"
import type {RelayMessage, ClientMessage} from "./message.js"

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
  Message = "socket:event:message",
}

export type SocketErrorEvent = {
  type: SocketEventType.Error
  error: string
}

export type SocketStatusEvent = {
  type: SocketEventType.Status
  status: SocketStatus
}

export type SocketMessageEvent = {
  type: SocketEventType.Message
  message: RelayMessage
}

export type SocketEvent = SocketErrorEvent | SocketStatusEvent | SocketMessageEvent

export const makeSocketErrorEvent = (error: string): SocketErrorEvent => ({
  type: SocketEventType.Error,
  error,
})

export const makeSocketStatusEvent = (status: SocketStatus): SocketStatusEvent => ({
  type: SocketEventType.Status,
  status,
})

export const makeSocketMessageEvent = (message: RelayMessage): SocketMessageEvent => ({
  type: SocketEventType.Message,
  message,
})

export const isSocketErrorEvent = (event: SocketEvent): event is SocketErrorEvent =>
  event.type === SocketEventType.Error

export const isSocketStatusEvent = (event: SocketEvent): event is SocketStatusEvent =>
  event.type === SocketEventType.Status

export const isSocketMessageEvent = (event: SocketEvent): event is SocketMessageEvent =>
  event.type === SocketEventType.Message

export type SocketSendSubscriber = (message: ClientMessage) => void

export type SocketRecvSubscriber = (event: SocketEvent) => void

export type SocketUnsubscriber = () => void

export class Socket {
  _ws?: WebSocket
  _sendSubs: SocketSendSubscriber[] = []
  _recvSubs: SocketRecvSubscriber[] = []
  _sendQueue: TaskQueue<ClientMessage>
  _recvQueue: TaskQueue<SocketEvent>

  constructor(readonly url: string) {
    this._sendQueue = new TaskQueue<ClientMessage>({
      batchSize: 50,
      processItem: (message: ClientMessage) => {
        this._ws?.send(JSON.stringify(message))

        for (const cb of this._sendSubs) {
          cb(message)
        }
      },
    })

    this._recvQueue = new TaskQueue<SocketEvent>({
      batchSize: 50,
      processItem: (event: SocketEvent) => {
        for (const cb of this._recvSubs) {
          cb(event)
        }
      },
    })
  }

  open = () => {
    if (this._ws) {
      throw new Error("Attempted to open a websocket that has not been closed")
    }

    try {
      this._ws = new WebSocket(this.url)
      this._recvQueue.push(makeSocketStatusEvent(SocketStatus.Opening))

      this._ws.onopen = () => this._recvQueue.push(makeSocketStatusEvent(SocketStatus.Open))

      this._ws.onerror = () => {
        this._recvQueue.push(makeSocketStatusEvent(SocketStatus.Error))
        this._ws = undefined
      }

      this._ws.onclose = () => {
        this._recvQueue.push(makeSocketStatusEvent(SocketStatus.Closed))
        this._ws = undefined
      }

      this._ws.onmessage = (event: any) => {
        const data = event.data as string

        try {
          const message = JSON.parse(data)

          if (Array.isArray(message)) {
            this._recvQueue.push(makeSocketMessageEvent(message as RelayMessage))
          } else {
            this._recvQueue.push(makeSocketErrorEvent("Invalid message received"))
          }
        } catch (e) {
          this._recvQueue.push(makeSocketErrorEvent("Invalid message received"))
        }
      }
    } catch (e) {
      this._recvQueue.push(makeSocketStatusEvent(SocketStatus.Invalid))
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
    this._recvSubs = []
    this._recvQueue.clear()
    this._sendSubs = []
    this._sendQueue.clear()
  }

  send = (message: ClientMessage) => {
    this._sendQueue.push(message)
  }

  onSend = (cb: SocketSendSubscriber) => {
    this._sendSubs.push(cb)

    return () => {
      this._sendSubs = remove(cb, this._sendSubs)
    }
  }

  subscribe = (cb: SocketRecvSubscriber) => {
    this._recvSubs.push(cb)

    return () => {
      this._recvSubs = remove(cb, this._recvSubs)
    }
  }

  onError = (cb: (error: string) => void) => {
    return this.subscribe((event: SocketEvent) => {
      if (isSocketErrorEvent(event)) {
        cb(event.error)
      }
    })
  }

  onStatus = (cb: (status: SocketStatus) => void) => {
    return this.subscribe((event: SocketEvent) => {
      if (isSocketStatusEvent(event)) {
        cb(event.status)
      }
    })
  }

  onMessage = (cb: (message: RelayMessage) => void) => {
    return this.subscribe((event: SocketEvent) => {
      if (isSocketMessageEvent(event)) {
        cb(event.message)
      }
    })
  }
}

export const socketPolicySendWhenOpen = (socket: Socket) => {
  // Pause sending messages when the socket isn't open
  const unsubscribe = socket.onStatus(newStatus => {
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

  const unsubscribeOnStatus = socket.onStatus(newStatus => {
    // Keep track of the most recent error
    if (newStatus === SocketStatus.Error) {
      lastError = now()
    }

    // Keep track of the current status
    currentStatus = newStatus
  })

  const unsubscribeOnSend = socket.onSend(message => {
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
