import {WebSocket} from "ws"
import {Deferred, defer} from "./Deferred"

export class Relay {
  ws?: WebSocket
  url: string
  ready?: Deferred<void>
  queue: string[]
  error: string
  status: string
  timeout?: number
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
    if (connections[url]) {
      error(`Connection to ${url} already exists`)
    }

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
        error("Attempted to connect when already connected", this)
      }

      this.ready = defer()
      this.ws = new WebSocket(this.url)
      this.status = Relay.STATUS.PENDING

      this.ws.addEventListener("open", () => {
        log(`Opened connection to ${this.url}`)

        this.status = Relay.STATUS.READY
        this.ready.resolve()
      })

      this.ws.addEventListener("message", e => {
        this.queue.push(e.data)

        if (!this.timeout) {
          this.timeout = global.setTimeout(() => this.handleMessages(), 10)
        }
      })

      this.ws.addEventListener("error", e => {
        log(`Error on connection to ${this.url}`)

        this.disconnect()
        this.ready.reject()
        this.error = Relay.ERROR.CONNECTION
        this.status = Relay.STATUS.CLOSED
      })

      this.ws.addEventListener("close", () => {
        log(`Closed connection to ${this.url}`)

        this.disconnect()
        this.ready.reject()
        this.status = Relay.STATUS.CLOSED
      })
    }

    await this.ready.catch(() => null)
  }
  disconnect() {
    if (this.ws) {
      log(`Disconnecting from ${this.url}`)

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

      this.bus.handle(...message)
    }

    this.timeout = this.queue.length > 0 ? global.setTimeout(() => this.handleMessages(), 10) : null
  }
  send(...payload) {
    if (this.ws?.readyState !== 1) {
      console.warn("Send attempted before socket was ready", this)
    }

    this.ws.send(JSON.stringify(payload))
  }
  subscribe(filters, id, {onEvent, onEose}) {
    const [eventChannel, eoseChannel] = [
      this.bus.on("EVENT", (subid, e) => subid === id && onEvent(e)),
      this.bus.on("EOSE", subid => subid === id && onEose()),
    ]

    this.send("REQ", id, ...filters)

    return {
      conn: this,
      unsub: () => {
        if (this.status === Relay.STATUS.READY) {
          this.send("CLOSE", id)
        }

        this.bus.off("EVENT", eventChannel)
        this.bus.off("EOSE", eoseChannel)
      },
    }
  }
  publish(event, {onOk, onError}) {
    const withCleanup = cb => k => {
      if (k === event.id) {
        cb()
        this.bus.off("OK", okChannel)
        this.bus.off("ERROR", errorChannel)
      }
    }

    const [okChannel, errorChannel] = [
      this.bus.on("OK", withCleanup(onOk)),
      this.bus.on("ERROR", withCleanup(onError)),
    ]

    this.send("EVENT", event)
  }
  count(filter, id, {onCount}) {
    const channel = this.bus.on("COUNT", (subid, ...payload) => {
      if (subid === id) {
        onCount(...payload)

        this.bus.off("COUNT", channel)
      }
    })

    this.send("COUNT", id, ...filter)
  }
}
