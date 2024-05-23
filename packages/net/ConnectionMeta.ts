import type {Event, Filter} from 'nostr-tools'
import type {Message} from './Socket'
import type {Connection} from './Connection'

export type PublishMeta = {
  sent: number
  event: Event
}

export type RequestMeta = {
  sent: number
  filters: Filter[]
  eoseReceived: boolean
}

export enum AuthStatus {
  Ok = 'ok',
  Pending = 'pending',
  Unauthorized = 'unauthorized',
  Forbidden = 'forbidden',
}

export enum ConnectionStatus {
  Unauthorized = 'unauthorized',
  Forbidden = 'forbidden',
  Error = 'error',
  Closed = 'closed',
  Slow = 'slow',
  Ok = 'ok',
}

export class ConnectionMeta {
  authStatus = AuthStatus.Pending
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
    const publish = this.pendingPublishes.get(eventId)

    if (ok) {
      this.authStatus = AuthStatus.Ok
    } else if (notice.startsWith('auth-required:')) {
      // Re-enqueue pending reqs when auth challenge is received
      const pub = this.pendingPublishes.get(eventId)

      if (pub) {
        this.cxn.send(['EVENT', pub.event])
      }
    }

    if (publish) {
      this.responseCount++
      this.responseTimer += Date.now() - publish.sent
      this.pendingPublishes.delete(eventId)
    }
  }

  onReceiveAuth([verb, eventId]: Message) {
    this.authStatus = AuthStatus.Unauthorized
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
    if (notice.startsWith('auth-required:')) {
      // Re-enqueue pending reqs when auth challenge is received
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

    if (this.authStatus === AuthStatus.Unauthorized)      return ConnectionStatus.Unauthorized
    if (this.authStatus === AuthStatus.Forbidden)         return ConnectionStatus.Forbidden
    if (socket.isNew())                                   return ConnectionStatus.Closed
    if (this.lastFault && this.lastFault > this.lastOpen) return ConnectionStatus.Error
    if (socket.isClosed() || socket.isClosing())          return ConnectionStatus.Closed
    if (this.getSpeed() > 1000)                           return ConnectionStatus.Slow

    return ConnectionStatus.Ok
  }

  getDescription = () => {
    switch (this.getStatus()) {
      case ConnectionStatus.Unauthorized: return 'Logging in'
      case ConnectionStatus.Forbidden:    return 'Failed to log in'
      case ConnectionStatus.Error:        return 'Failed to connect'
      case ConnectionStatus.Closed:       return 'Waiting to reconnect'
      case ConnectionStatus.Slow:         return 'Slow Connection'
      case ConnectionStatus.Ok:           return 'Connected'
    }
  }
}
