import WebSocket from "isomorphic-ws"
import {Deferred, defer} from '@welshman/lib'

export type Message = [string, ...any[]]

export type PlexMessage = [{relays: string[]}, Message]

export type SocketMessage = Message | PlexMessage

export const isMessage = (m: SocketMessage): boolean => typeof m[0] === 'string'

export const asMessage = (m: SocketMessage): Message => isMessage(m) ? m : m[1]

export type SocketOpts = {
  onOpen: () => void
  onClose: () => void
  onError: () => void
  onMessage: (message: SocketMessage) => void
}

export class Socket {
  url: string
  ws?: WebSocket
  ready: Deferred<boolean>
  failedToConnect = false

  constructor(url: string, readonly opts: SocketOpts) {
    this.url = url
    this.ready = defer()
  }

  isPending() {
    return !this.ws && !this.failedToConnect
  }

  isConnecting() {
    return this.ws?.readyState === WebSocket.CONNECTING
  }

  isReady() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  isClosing() {
    return this.ws?.readyState === WebSocket.CLOSING
  }

  isClosed() {
    return this.ws?.readyState === WebSocket.CLOSED
  }

  isHealthy() {
    return this.isPending() || this.isConnecting() || this.isReady()
  }

  onOpen = () => {
    this.ready.resolve(true)
    this.opts.onOpen()
  }

  onError = () => {
    this.opts.onError()
    this.disconnect()
  }

  onMessage = (event: {data: string}) => {
    try {
      const message = JSON.parse(event.data as string)

      if (Array.isArray(message)) {
        this.opts.onMessage(message as Message)
      } else {
        console.warn("Invalid messages received:", message)
      }
    } catch (e) {
      // pass
    }
  }

  send = (message: any) => {
    if (!this.ws) {
      throw new Error('Send attempted before socket was opened')
    }

    this.ws.send(JSON.stringify(message))
  }

  connect = () => {
    if (this.ws) {
      throw new Error(`Already attempted connection for ${this.url}`)
    }

    try {
      this.ws = new WebSocket(this.url)
      this.ws.onopen = this.onOpen
      this.ws.onerror = this.onError
      this.ws.onmessage = this.onMessage
      this.ws.onclose = this.disconnect
    } catch (e) {
      this.failedToConnect = true
    }
  }

  disconnect = () => {
    if (this.ws) {
      const currentWs = this.ws

      this.ready.then(() => currentWs.close())
      this.ready = defer()
      this.opts.onClose()
      this.ws = undefined

      // Resolve a different instance of the promise
      this.ready.resolve(false)
    }
  }
}
