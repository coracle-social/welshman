import WebSocket from "isomorphic-ws"
import {EventBus} from "./EventBus"
import {Deferred, defer} from "./Deferred"

export class Socket {
  ws?: WebSocket
  url: string
  ready: Deferred<void>
  timeout?: NodeJS.Timeout
  queue: string[]
  bus: EventBus
  status: string
  error?: Error
  _onOpen: (e: any) => void
  _onMessage: (e: any) => void
  _onError: (e: any) => void
  _onClose: (e: any) => void
  static STATUS = {
    NEW: "new",
    PENDING: "pending",
    CLOSED: "closed",
    READY: "ready",
  }
  constructor(url: string) {
    this.url = url
    this.ready = defer()
    this.queue = []
    this.bus = new EventBus()
    this.status = Socket.STATUS.NEW

    this._onOpen = () => {
      this.error = undefined
      this.status = Socket.STATUS.READY
      this.ready.resolve()
      this.bus.emit('open')
    }

    this._onMessage = event => {
      this.queue.push(event.data as string)

      if (!this.timeout) {
        this.handleMessagesAsync()
      }
    }

    this._onError = (error: Error) => {
      this.error = error
      this.bus.emit('error', error)
    }

    this._onClose = () => {
      this.disconnect()
      this.ready.reject()
      this.status = Socket.STATUS.CLOSED
      this.bus.emit('close')
    }
  }
  async connect() {
    if ([Socket.STATUS.NEW, Socket.STATUS.CLOSED].includes(this.status)) {
      if (this.ws) {
        console.error("Attempted to connect when already connected", this)
      }

      this.ready = defer()
      this.ws = new WebSocket(this.url)
      this.status = Socket.STATUS.PENDING

      this.ws.addEventListener("open", this._onOpen)
      this.ws.addEventListener("message", this._onMessage)
      this.ws.addEventListener("error", this._onError)
      this.ws.addEventListener("close", this._onClose)
    }

    await this.ready.catch(() => null)
  }
  disconnect() {
    if (this.ws) {
      const ws = this.ws

      // Avoid "WebSocket was closed before the connection was established"
      this.ready.then(() => ws.close(), () => null)

      this.ws.removeEventListener("open", this._onOpen)
      this.ws.removeEventListener("message", this._onMessage)
      this.ws.removeEventListener("error", this._onError)
      this.ws.removeEventListener("close", this._onClose)
      this.ws = undefined
    }
  }
  cleanup() {
    this.disconnect()
    this.bus.clear()
  }
  handleMessages() {
    for (const json of this.queue.splice(0, 10)) {
      let message
      try {
        message = JSON.parse(json)
      } catch (e) {
        continue
      }

      this.bus.emit('message', this.url, message)
    }

    if (this.queue.length > 0) {
      this.handleMessagesAsync()
    } else {
      this.timeout = undefined
    }
  }
  handleMessagesAsync() {
    this.timeout = setTimeout(() => this.handleMessages(), 10) as NodeJS.Timeout
  }
  send(message: any) {
    if (this.status === Socket.STATUS.READY) {
      if (this.ws?.readyState !== 1) {
        console.warn("Send attempted before socket was ready", this)
      }

      this.ws?.send(JSON.stringify(message))
    }
  }
}
