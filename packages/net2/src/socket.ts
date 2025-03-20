import WebSocket from "isomorphic-ws"
import {remove, TaskQueue} from "@welshman/lib"
import type {
  RelayMessage,
  RelayAuthPayload,
  RelayEosePayload,
  RelayEventPayload,
  RelayOkPayload,
} from "./message.js"
import {
  isRelayAuthMessage,
  isRelayEoseMessage,
  isRelayEventMessage,
  isRelayOkMessage,
} from "./message.js"

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

export type SocketSubscriber = (event: SocketEvent) => void

export type SocketUnsubscriber = () => void

export interface ISocket {
  open(): void
  close(): void
  cleanup(): void
  send(...message: any[]): void
  subscribe(cb: SocketSubscriber): SocketUnsubscriber
  onError(cb: (error: string) => void): SocketUnsubscriber
  onStatus(cb: (status: SocketStatus) => void): SocketUnsubscriber
  onMessage(cb: (message: RelayMessage) => void): SocketUnsubscriber
  onAuth(cb: (message: RelayAuthPayload) => void): SocketUnsubscriber
  onEose(cb: (message: RelayEosePayload) => void): SocketUnsubscriber
  onEvent(cb: (message: RelayEventPayload) => void): SocketUnsubscriber
  onOk(cb: (message: RelayOkPayload) => void): SocketUnsubscriber
  wrap(overrides: Partial<ISocket>): ISocket
}

export class Socket implements ISocket {
  _ws?: WebSocket
  _subs: SocketSubscriber[] = []
  _queue: TaskQueue<SocketEvent>

  constructor(readonly url: string) {
    this._queue = new TaskQueue<SocketEvent>({
      batchSize: 50,
      processItem: (event: SocketEvent) => {
        for (const cb of this._subs) {
          cb(event)
        }
      },
    })
  }

  open = () => {
    try {
      this._ws = new WebSocket(this.url)
      this._queue.push(makeSocketStatusEvent(SocketStatus.Opening))
      this._ws.onopen = () => this._queue.push(makeSocketStatusEvent(SocketStatus.Open))
      this._ws.onerror = () => this._queue.push(makeSocketStatusEvent(SocketStatus.Error))
      this._ws.onclose = () => this._queue.push(makeSocketStatusEvent(SocketStatus.Closed))
      this._ws.onmessage = (event: any) => {
        const data = event.data as string

        try {
          const message = JSON.parse(data)

          if (Array.isArray(message)) {
            this._queue.push(makeSocketMessageEvent(message as RelayMessage))
          } else {
            this._queue.push(makeSocketErrorEvent("Invalid message received"))
          }
        } catch (e) {
          this._queue.push(makeSocketErrorEvent("Invalid message received"))
        }
      }
    } catch (e) {
      this._queue.push(makeSocketStatusEvent(SocketStatus.Invalid))
    }
  }

  close = () => {
    this._ws?.close()
    this._ws = undefined
  }

  cleanup = () => {
    this.close()
    this._subs = []
    this._queue.clear()
  }

  send = (...message: any[]) => {
    this._ws?.send(JSON.stringify(message))
  }

  subscribe = (cb: SocketSubscriber) => {
    this._subs.push(cb)

    return () => {
      this._subs = remove(cb, this._subs)
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

  onAuth = (cb: (message: RelayAuthPayload) => void) => {
    return this.onMessage((message: RelayMessage) => {
      if (isRelayAuthMessage(message)) {
        cb(message.slice(1) as RelayAuthPayload)
      }
    })
  }

  onEose = (cb: (message: RelayEosePayload) => void) => {
    return this.onMessage((message: RelayMessage) => {
      if (isRelayEoseMessage(message)) {
        cb(message.slice(1) as RelayEosePayload)
      }
    })
  }

  onEvent = (cb: (message: RelayEventPayload) => void) => {
    return this.onMessage((message: RelayMessage) => {
      if (isRelayEventMessage(message)) {
        cb(message.slice(1) as RelayEventPayload)
      }
    })
  }

  onOk = (cb: (message: RelayOkPayload) => void) => {
    return this.onMessage((message: RelayMessage) => {
      if (isRelayOkMessage(message)) {
        cb(message.slice(1) as RelayOkPayload)
      }
    })
  }

  wrap = (overrides: Partial<ISocket>): ISocket => {
    return new Proxy(this, {
      get: (target, prop: keyof ISocket) => {
        if (prop in overrides) {
          return overrides[prop]
        }

        return target[prop]
      },
    })
  }
}
