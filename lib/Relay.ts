import WebSocket from "isomorphic-ws"
import {EventBus} from "./util/EventBus"
import {Deferred, defer} from "./util/Deferred"

export class Relay {
  ws?: WebSocket
  url: string
  ready?: Deferred<void>
  queue: string[]
  error: string
  status: string
  timeout?: NodeJS.Timeout
  bus: EventBus
  static STATUS = {
    NEW: "new",
    PENDING: "pending",
    CLOSED: "closed",
    ERROR: "error",
    READY: "ready",
  }
  static ERROR = {
    CONNECTION: "connection",
    UNAUTHORIZED: "unauthorized",
    FORBIDDEN: "forbidden",
  }
  constructor(url) {
    this.ws = null
    this.url = url
    this.ready = null
    this.queue = []
    this.timeout = null
    this.bus = new EventBus()
    this.error = null
    this.status = Relay.STATUS.NEW
  }
  async connect() {
    if (this.status === Relay.STATUS.NEW) {
      if (this.ws) {
        console.error("Attempted to connect when already connected", this)
      }

      this.ready = defer()
      this.ws = new WebSocket(this.url)
      this.status = Relay.STATUS.PENDING

      this.ws.addEventListener("open", () => {
        console.log(`Opened connection to ${this.url}`)

        this.status = Relay.STATUS.READY
        this.ready.resolve()
      })

      this.ws.addEventListener("message", e => {
        this.queue.push(e.data)

        if (!this.timeout) {
          this.timeout = setTimeout(() => this.handleMessages(), 10)
        }
      })

      this.ws.addEventListener("error", e => {
        console.log(`Error on connection to ${this.url}`)

        this.disconnect()
        this.ready.reject()
        this.error = Relay.ERROR.CONNECTION
        this.status = Relay.STATUS.CLOSED
      })

      this.ws.addEventListener("close", () => {
        console.log(`Closed connection to ${this.url}`)

        this.disconnect()
        this.ready.reject()
        this.status = Relay.STATUS.CLOSED
      })
    }

    await this.ready.catch(() => null)
  }
  reconnect() {
    if (this.status === Relay.STATUS.ERROR) {
      this.status = Relay.STATUS.NEW
      this.connect()
    }
  }
  disconnect() {
    if (this.ws) {
      console.log(`Disconnecting from ${this.url}`)

      this.ws.close()
      this.ws = null
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

      const [verb, ...args] = message

      this.bus.handle(verb, ...args)
    }

    this.timeout = this.queue.length > 0 ? setTimeout(() => this.handleMessages(), 10) : null
  }
  send(...payload) {
    if (this.ws?.readyState !== 1) {
      console.warn("Send attempted before socket was ready", this)
    }

    this.ws.send(JSON.stringify(payload))
  }
}
