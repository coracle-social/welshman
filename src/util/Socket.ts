import type {MessageEvent} from 'isomorphic-ws'
import WebSocket from "isomorphic-ws"
import {Deferred, defer} from "./Deferred"

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
  ready: Deferred<void>
  failedToConnect = false

  constructor(url: string, readonly opts: SocketOpts) {
    this.url = url
    this.ready = defer()
  }

  _close() {
    if (!this.ws) {
      throw new Error('Socket was closed before it was opened')
    }

    // Avoid "WebSocket was closed before the connection was established"
    this.ready.then(() => this.ws?.close()).catch(() => null)
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
    this.ready.resolve()
    this.opts.onOpen()
  }

  onClose = () => {
    this.ready.reject()
    this.opts.onClose()

    if (this.ws) {
      this._close()
    }
  }

  onError = () => {
    this.ready.reject()
    this.opts.onError()
    this._close()
  }

  onMessage = (event: MessageEvent) => {
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
      this.ws.onclose = this.onClose
      this.ws.onerror = this.onError
      this.ws.onmessage = this.onMessage
    } catch (e) {
      this.failedToConnect = true
    }
  }

  disconnect() {
    this.onClose()
  }

  reset() {
    if (this.ws) {
      this._close()
    }

    this.ws = undefined
    this.ready = defer()
  }
}
