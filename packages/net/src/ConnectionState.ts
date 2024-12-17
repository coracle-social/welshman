import {sleep} from "@welshman/lib"
import {AUTH_JOIN} from "@welshman/util"
import type {SignedEvent, Filter} from "@welshman/util"
import type {Message} from "./Socket.js"
import type {Connection} from "./Connection.js"
import {ConnectionEvent} from "./ConnectionEvent.js"

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
    cxn.sender.worker.addGlobalHandler(([verb, ...extra]: Message) => {
      if (verb === "REQ") {
        const [reqId, ...filters] = extra

        this.pendingRequests.set(reqId, {filters, sent: Date.now()})
      }

      if (verb === "CLOSE") {
        const [reqId] = extra

        this.pendingRequests.delete(reqId)
      }

      if (verb === "EVENT") {
        const [event] = extra

        this.pendingPublishes.set(event.id, {sent: Date.now(), event})
      }
    })

    cxn.socket.worker.addGlobalHandler(([verb, ...extra]: Message) => {
      if (verb === "OK") {
        const [eventId, _ok, notice] = extra
        const pub = this.pendingPublishes.get(eventId)

        if (!pub) return

        // Re-enqueue pending events when auth challenge is received
        if (notice?.startsWith("auth-required:") && pub.event.kind !== AUTH_JOIN) {
          this.cxn.send(["EVENT", pub.event])
        } else {
          this.pendingPublishes.delete(eventId)
        }
      }

      if (verb === "EOSE") {
        const [reqId] = extra
        const req = this.pendingRequests.get(reqId)

        if (req) {
          req.eose = true
        }
      }

      if (verb === "CLOSED") {
        const [reqId] = extra

        // Re-enqueue pending reqs when auth challenge is received
        if (extra[1]?.startsWith("auth-required:")) {
          const req = this.pendingRequests.get(reqId)

          if (req) {
            this.cxn.send(["REQ", reqId, ...req.filters])
          }

          if (extra[1]) {
            this.cxn.emit(ConnectionEvent.Notice, extra[1])
          }
        }

        this.pendingRequests.delete(reqId)
      }

      if (verb === "NOTICE") {
        const [notice] = extra

        this.cxn.emit(ConnectionEvent.Notice, notice)
      }
    })

    // Whenever we reconnect, re-enqueue pending stuff. Delay this so that if a connection
    // is flapping we're not sending too much noise.
    cxn.on(ConnectionEvent.Close, async (cxn: Connection) => {
      await sleep(10_000)

      if (this.pendingRequests.size > 0 || this.pendingPublishes.size > 0) {
        this.cxn.open()
      }

      for (const [reqId, req] of this.pendingRequests.entries()) {
        this.cxn.send(["REQ", reqId, ...req.filters])
      }

      for (const [_, pub] of this.pendingPublishes.entries()) {
        this.cxn.send(["EVENT", pub.event])
      }
    })
  }
}
