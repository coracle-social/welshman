import {AUTH_JOIN} from '@welshman/util'
import type {SignedEvent, Filter} from '@welshman/util'
import type {Message} from './Socket'
import type {Connection} from './Connection'
import {ConnectionEvent} from './ConnectionEvent'

export type PublishState = {
  sent: number
  event: SignedEvent
}

export type RequestState = {
  sent: number
  filters: Filter[]
  eose?: boolean
}

export class ConnectionState {
  pendingPublishes = new Map<string, PublishState>()
  pendingRequests = new Map<string, RequestState>()

  constructor(readonly cxn: Connection) {
    cxn.on(ConnectionEvent.Send, (cxn: Connection, [verb, ...extra]: Message) => {
      if (verb === 'REQ') {
        const [reqId, ...filters] = extra

        this.pendingRequests.set(reqId, {filters, sent: Date.now()})
      }

      if (verb === 'CLOSE') {
        const [reqId] = extra

        this.pendingRequests.delete(reqId)
      }

      if (verb === 'EVENT') {
        const [event] = extra

        this.pendingPublishes.set(event.id, {sent: Date.now(), event: event.id})
      }
    })

    cxn.on(ConnectionEvent.Receive, (cxn: Connection, [verb, ...extra]: Message) => {
      if (verb === 'OK') {
        const [eventId, _ok, notice] = extra
        const pub = this.pendingPublishes.get(eventId)

        if (!pub) return

        // Re-enqueue pending events when auth challenge is received
        if (notice?.startsWith('auth-required:') && pub.event.kind !== AUTH_JOIN) {
          this.cxn.send(['EVENT', pub.event])
        } else {
          this.pendingPublishes.delete(eventId)
        }
      }

      if (verb === 'EOSE') {
        const [reqId] = extra
        const req = this.pendingRequests.get(reqId)

        if (req) {
          req.eose = true
        }
      }

      if (verb === 'CLOSED') {
        const [reqId] = extra

        // Re-enqueue pending reqs when auth challenge is received
        if (extra[1]?.startsWith('auth-required:')) {
          const req = this.pendingRequests.get(reqId)

          if (req) {
            this.cxn.send(['REQ', reqId, ...req.filters])
          }

          if (extra[1]) {
            this.cxn.emit(ConnectionEvent.Notice, extra[1])
          }
        }
      }

      if (verb === 'NOTICE') {
        const [notice] = extra

        this.cxn.emit(ConnectionEvent.Notice, notice)
      }
    })
  }
}
