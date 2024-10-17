import {AUTH_JOIN} from '@welshman/util'
import type {SignedEvent, Filter} from '@welshman/util'
import type {Message} from './Socket'
import type {Connection} from './Connection'

export type PublishMeta = {
  sent: number
  event: SignedEvent
}

export type RequestMeta = {
  sent: number
  filters: Filter[]
  eoseReceived: boolean
}

export enum ConnectionStatus {
  Error = 'error',
  Closed = 'closed',
  Slow = 'slow',
  Ok = 'ok',
}

export class ConnectionMeta {
  pendingPublishes = new Map<string, PublishMeta>()
  pendingRequests = new Map<string, RequestMeta>()
  publishCount = 0
  requestCount = 0
  eventCount = 0
  lastOpen = 0
  lastClose = 0
  lastFault = 0
  lastPublish = 0
  lastRequest = 0
  lastEvent = 0
  lastAuth = 0
  responseCount = 0
  responseTimer = 0

  constructor(readonly cxn: Connection) {
    cxn.on('open', () => {
      this.lastOpen = Date.now()
    })

    cxn.on('close', () => {
      this.lastClose = Date.now()
    })

    cxn.on('fault', () => {
      this.lastFault = Date.now()
    })

    cxn.on('send', (cxn: Connection, message: Message) => {
      if (message[0] === 'REQ') this.onSendRequest(message)
      if (message[0] === 'CLOSE') this.onSendClose(message)
      if (message[0] === 'EVENT') this.onSendEvent(message)
    })

    cxn.on('receive', (cxn: Connection, message: Message) => {
      if (message[0] === 'OK') this.onReceiveOk(message)
      if (message[0] === 'AUTH') this.onReceiveAuth(message)
      if (message[0] === 'EVENT') this.onReceiveEvent(message)
      if (message[0] === 'EOSE') this.onReceiveEose(message)
      if (message[0] === 'CLOSED') this.onReceiveClosed(message)
      if (message[0] === 'NOTICE') this.onReceiveNotice(message)
    })
  }

  onSendRequest([verb, subId, ...filters]: Message) {
    this.requestCount++
    this.lastRequest = Date.now()
    this.pendingRequests.set(subId, {
      filters,
      sent: Date.now(),
      eoseReceived: false,
    })
  }

  onSendClose([verb, subId]: Message) {
    this.pendingRequests.delete(subId)
  }

  onSendEvent([verb, event]: Message) {
    this.publishCount++
    this.lastPublish = Date.now()
    this.pendingPublishes.set(event.id, {sent: Date.now(), event})
  }

  onReceiveOk([verb, eventId, ok, notice]: Message) {
    const pub = this.pendingPublishes.get(eventId)

    if (!pub) return

    // Re-enqueue pending events when auth challenge is received
    if (notice?.startsWith('auth-required:') && pub.event.kind !== AUTH_JOIN) {
      this.cxn.send(['EVENT', pub.event])
    } else {
      this.responseCount++
      this.responseTimer += Date.now() - pub.sent
      this.pendingPublishes.delete(eventId)
    }
  }

  onReceiveAuth(message: Message) {
    this.lastAuth = Date.now()
  }

  onReceiveEvent([verb, event]: Message) {
    this.eventCount++
    this.lastEvent = Date.now()
  }

  onReceiveEose([verb, subId]: Message) {
    const request = this.pendingRequests.get(subId)

    // Only count the first eose
    if (request && !request.eoseReceived) {
      request.eoseReceived = true

      this.responseCount++
      this.responseTimer += Date.now() - request.sent
    }
  }

  onReceiveClosed([verb, id, notice]: Message) {
    // Re-enqueue pending reqs when auth challenge is received
    if (notice?.startsWith('auth-required:')) {
      const req = this.pendingRequests.get(id)

      if (req) {
        this.cxn.send(['REQ', id, ...req.filters])
      }
    }
  }

  onReceiveNotice([verb, notice]: Message) {
    console.warn('NOTICE', this.cxn.url, notice)
  }

  clearPending = () => {
    this.pendingPublishes.clear()
    this.pendingRequests.clear()
  }

  getSpeed = () => this.responseCount ? this.responseTimer / this.responseCount : 0

  getStatus = () => {
    const socket = this.cxn.socket

    if (socket.isNew())                                   return ConnectionStatus.Closed
    if (this.lastFault && this.lastFault > this.lastOpen) return ConnectionStatus.Error
    if (socket.isClosed() || socket.isClosing())          return ConnectionStatus.Closed
    if (this.getSpeed() > 2000)                           return ConnectionStatus.Slow

    return ConnectionStatus.Ok
  }
}
