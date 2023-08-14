import type {Event, Filter} from './types'
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

  constructor(cxn: Connection) {
    cxn.on('open', () => {
      this.lastOpen = Date.now()
    })

    cxn.on('close', () => {
      this.lastClose = Date.now()
    })

    cxn.on('fault', () => {
      this.lastFault = Date.now()
    })

    // @ts-ignore
    cxn.on('send', (cxn, [verb, ...payload]) => {
      // @ts-ignore
      if (verb === 'REQ') this.onSendRequest(...payload)
      // @ts-ignore
      if (verb === 'CLOSE') this.onSendClose(...payload)
      // @ts-ignore
      if (verb === 'EVENT') this.onSendEvent(...payload)
    })

    // @ts-ignore
    cxn.on('receive', (cxn, [verb, ...payload]) => {
      // @ts-ignore
      if (verb === 'OK') this.onReceiveOk(...payload)
      // @ts-ignore
      if (verb === 'AUTH') this.onReceiveAuth(...payload)
      // @ts-ignore
      if (verb === 'EVENT') this.onReceiveEvent(...payload)
      // @ts-ignore
      if (verb === 'EOSE') this.onReceiveEose(...payload)
    })
  }

  onSendRequest(subId: string, ...filters: Filter[]) {
    this.requestCount++
    this.lastRequest = Date.now()
    this.pendingRequests.set(subId, {
      filters,
      sent: Date.now(),
      eoseReceived: false,
    })
  }

  onSendClose(subId: string) {
    this.pendingRequests.delete(subId)
  }

  onSendEvent(event: Event) {
    this.publishCount++
    this.lastPublish = Date.now()
    this.pendingPublishes.set(event.id, {sent: Date.now(), event})
  }

  onReceiveOk(eventId: string) {
    const publish = this.pendingPublishes.get(eventId)

    this.authStatus = AuthStatus.Ok

    if (publish) {
      this.responseCount++
      this.responseTimer += Date.now() - publish.sent
      this.pendingPublishes.delete(eventId)
    }
  }

  onReceiveAuth(eventId: string) {
    this.authStatus = AuthStatus.Unauthorized
  }

  onReceiveEvent(event: Event) {
    this.eventCount++
    this.lastEvent = Date.now()
  }

  onReceiveEose(subId: string) {
    const request = this.pendingRequests.get(subId)

    // Only count the first eose
    if (request && !request.eoseReceived) {
      request.eoseReceived = true

      this.responseCount++
      this.responseTimer += Date.now() - request.sent
    }
  }

  clearPending = () => {
    this.pendingPublishes.clear()
    this.pendingRequests.clear()
  }

  getSpeed = () => this.responseCount ? this.responseTimer / this.responseCount : 0

  getStatus = () => {
    if (this.authStatus === AuthStatus.Unauthorized) return ConnectionStatus.Unauthorized
    if (this.authStatus === AuthStatus.Forbidden)    return ConnectionStatus.Forbidden
    if (this.lastFault > this.lastOpen)              return ConnectionStatus.Error
    if (this.lastClose > this.lastOpen)              return ConnectionStatus.Closed
    if (this.getSpeed() > 500)                       return ConnectionStatus.Slow

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
