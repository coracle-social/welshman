import WebSocket from "isomorphic-ws"
import {EventEmitter} from 'events'
import {Deferred, defer} from "./Deferred"

export class Socket extends EventEmitter {
  ws?: WebSocket
  url: string
  ready: Deferred<void>
  timeout?: NodeJS.Timeout
  queue: [string, any][]
  status: string
  static STATUS = {
    NEW: "new",
    PENDING: "pending",
    CLOSED: "closed",
    ERROR: "error",
    READY: "ready",
  }
  constructor(url: string) {
    super()

    this.url = url
    this.ready = defer()
    this.queue = []
    this.status = Socket.STATUS.NEW

    this.setMaxListeners(100)
  }
  send = (message: any) => {
    this.connect()
    this.queue.push(['send', message])
    this.enqueueWork()
  }
  onMessage = (event: {data: string}) => {
    this.queue.push(['receive', event.data])
    this.enqueueWork()
  }
  onOpen = () => {
    this.status = Socket.STATUS.READY
    this.ready.resolve()
    this.emit('open', this)
  }
  onError = () => {
    this.disconnect()
    this.ready.reject()
    this.status = Socket.STATUS.ERROR
    this.emit('fault', this)
  }
  onClose = () => {
    if (this.status !== Socket.STATUS.ERROR) {
      this.disconnect()
      this.ready.reject()
      this.status = Socket.STATUS.CLOSED
    }

    this.emit('close', this)
  }
  connect = () => {
    const {NEW, CLOSED, PENDING} = Socket.STATUS

    if ([NEW, CLOSED].includes(this.status)) {
      this.ready = defer()
      this.status = PENDING
      this.ws = new WebSocket(this.url)
      this.ws.addEventListener("open", this.onOpen)
      this.ws.addEventListener("close", this.onClose)
      this.ws.addEventListener("error", this.onError)
      // @ts-ignore
      this.ws.addEventListener("message", this.onMessage)
    }
  }
  disconnect = () => {
    if (this.ws) {
      const ws = this.ws

      // Avoid "WebSocket was closed before the connection was established"
      this.ready.then(() => ws.close(), () => null)
      this.ws = undefined
    }
  }
  receiveMessage = (json: string) => {
    try {
      this.emit('receive', this, JSON.parse(json))
    } catch (e) {
      // pass
    }
  }
  sendMessage = (message: any) => {
    this.emit('send', this, message)

    // @ts-ignore
    this.ws.send(JSON.stringify(message))
  }
  shouldDeferWork = () => {
    // These sometimes get out of sync
    return this.status !== Socket.STATUS.READY || this.ws?.readyState !== 1
  }
  doWork = () => {
    this.timeout = undefined

    for (const [action, payload] of this.queue.splice(0, 10)) {
      if (action === 'receive') {
        this.receiveMessage(payload)
      }

      if (action === 'send') {
        if (this.shouldDeferWork()) {
          this.queue.push(['send', payload])
        } else {
          this.sendMessage(payload)
        }
      }
    }

    this.enqueueWork()
  }
  enqueueWork = () => {
    if (!this.timeout && this.queue.length > 0) {
      this.timeout = setTimeout(() => this.doWork(), 100) as NodeJS.Timeout
    }
  }
}
