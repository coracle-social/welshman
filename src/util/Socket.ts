import WebSocket from "isomorphic-ws"
import {EventEmitter} from 'events'
import {Deferred, defer} from "./Deferred"

export class Socket extends EventEmitter {
  ws?: WebSocket
  url: string
  ready: Deferred<void>
  timeout?: NodeJS.Timeout
  receiveQueue: any[] = []
  sendQueue: any[] = []
  status: string
  static STATUS = {
    NEW: "new",
    UNAUTHORIZED: "unauthorized",
    PENDING: "pending",
    CLOSED: "closed",
    ERROR: "error",
    READY: "ready",
  }
  constructor(url: string) {
    super()

    this.url = url
    this.ready = defer()
    this.status = Socket.STATUS.NEW

    this.setMaxListeners(100)
  }
  send = (message: any) => {
    this.connect()
    this.sendQueue.push(message)
    this.enqueueWork()
  }
  onMessage = (event: {data: string}) => {
    this.receiveQueue.push(event.data)
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
    if (this.ws) {
      const ws = this.ws

      // Avoid "WebSocket was closed before the connection was established"
      this.ready.then(() => ws.close(), () => null)
      this.ws.removeEventListener("open", this.onOpen)
      this.ws.removeEventListener("close", this.onClose)
      this.ws.removeEventListener("error", this.onError)
      // @ts-ignore
      this.ws.removeEventListener("message", this.onMessage)
      this.ws = undefined
    }

    if (this.status !== Socket.STATUS.ERROR) {
      this.status = Socket.STATUS.CLOSED
    }

    this.ready.reject()
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
    this.onClose()
  }
  receiveMessage = (json: string) => {
    try {
      const message = JSON.parse(json)

      if (message?.[0] == 'AUTH') {
        this.status = Socket.STATUS.UNAUTHORIZED
      }

      if (message?.[0] == 'OK' && this.status === Socket.STATUS.UNAUTHORIZED) {
        this.status = Socket.STATUS.READY
      }

      this.emit('receive', this, message)
    } catch (e) {
      // pass
    }
  }
  sendMessage = (message: any) => {
    this.emit('send', this, message)

    // @ts-ignore
    this.ws.send(JSON.stringify(message))
  }
  shouldDefer = (payload: any[]) => {
    if (this.ws?.readyState !== 1) {
      return true
    }

    if (this.status === Socket.STATUS.UNAUTHORIZED) {
      return payload?.[0] !== 'AUTH'
    }

    return this.status !== Socket.STATUS.READY
  }
  doWork = () => {
    this.timeout = undefined

    for (const payload of this.receiveQueue.splice(0, 10)) {
      this.receiveMessage(payload)
    }

    for (const payload of this.sendQueue.splice(0, 10)) {
      if (this.shouldDefer(payload)) {
        this.sendQueue.push(payload)
      } else {
        this.sendMessage(payload)
      }
    }

    this.enqueueWork()
  }
  enqueueWork = () => {
    if (!this.timeout && (this.receiveQueue.length > 0 || this.sendQueue.length > 0)) {
      this.timeout = setTimeout(() => this.doWork(), 100) as NodeJS.Timeout
    }
  }
}
