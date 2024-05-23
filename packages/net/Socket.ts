import WebSocket from "isomorphic-ws"
import {sleep} from '@welshman/lib'

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
  ws?: WebSocket | 'invalid'

  constructor(readonly url: string, readonly opts: SocketOpts) {}

  isNew = () => this.ws === undefined

  isInvalid = () => this.ws === 'invalid'

  isConnecting = () => this.ws?.readyState === WebSocket.CONNECTING

  isOpen = () => this.ws?.readyState === WebSocket.OPEN

  isClosing = () => this.ws?.readyState === WebSocket.CLOSING

  isClosed = () => this.ws?.readyState === WebSocket.CLOSED

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

  send = (message: any) => this.ws.send(JSON.stringify(message))

  connect = async () => {
    if (this.ws) {
      throw new Error(`Already attempted connection for ${this.url}`)
    }

    try {
      this.ws = new WebSocket(this.url)
      this.ws.onopen = this.opts.onOpen
      this.ws.onerror = this.opts.onError
      this.ws.onclose = this.opts.onClose
      this.ws.onmessage = this.onMessage
    } catch (e) {
      this.ws = 'invalid'
      this.opts.onError()
    }

    while (this.isConnecting()) {
      await sleep(100)
    }
  }

  disconnect = async () => {
    while (this.isConnecting()) {
      await sleep(100)
    }

    if (this.isOpen()) {
      this.ws.close()
    }

    while (this.isClosing()) {
      await sleep(100)
    }

    this.ws = undefined
  }
}
