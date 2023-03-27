import WebSocket from "isomorphic-ws"
import {EventBus} from "./EventBus"
import {Deferred, defer} from "./Deferred"

export class Socket {
  ws?: WebSocket
  url: string
  ready?: Deferred<void>
  timeout?: NodeJS.Timeout
  queue: string[]
  bus: EventBus
  status: string
  static STATUS = {
    NEW: "new",
    PENDING: "pending",
    CLOSED: "closed",
    READY: "ready",
  }
  constructor(url: string) {
    this.ws = undefined
    this.url = url
    this.ready = undefined
    this.timeout = undefined
    this.queue = []
    this.bus = new EventBus()
    this.status = Socket.STATUS.NEW
  }
  async connect() {
    if ([Socket.STATUS.NEW, Socket.STATUS.CLOSED].includes(this.status)) {
      if (this.ws) {
        console.error("Attempted to connect when already connected", this)
      }

      this.ready = defer()
      this.ws = new WebSocket(this.url)
      this.status = Socket.STATUS.PENDING

      this.ws.addEventListener("open", () => {
        console.log(`Opened connection to ${this.url}`)

        this.status = Socket.STATUS.READY
        this.ready?.resolve()
      })

      this.ws.addEventListener("message", e => {
        this.queue.push(e.data as string)

        if (!this.timeout) {
          this.timeout = this.handleMessagesAsync()
        }
      })

      this.ws.addEventListener("error", e => {
        console.log(`Error on connection to ${this.url}`)

        this.disconnect()
        this.ready?.reject()
        this.status = Socket.STATUS.CLOSED
      })

      this.ws.addEventListener("close", () => {
        console.log(`Closed connection to ${this.url}`)

        this.disconnect()
        this.ready?.reject()
        this.status = Socket.STATUS.CLOSED
      })
    }

    await this.ready?.catch(() => null)
  }
  disconnect() {
    if (this.ws) {
      console.log(`Disconnecting from ${this.url}`)

      this.ws.close()
      this.ws = undefined
    }
  }
  handleMessages() {
    for (const json of this.queue.splice(0, 10)) {
      let message
      try {
        message = JSON.parse(json)
      } catch (e) {
        continue
      }

      this.bus.handle('message', message)
    }

    this.timeout = this.queue.length > 0 ? this.handleMessagesAsync() : undefined
  }
  handleMessagesAsync() {
    return setTimeout(() => this.handleMessages(), 10) as NodeJS.Timeout
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
