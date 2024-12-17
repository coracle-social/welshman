import type {Message} from "./Socket.js"
import type {Connection} from "./Connection.js"
import {ConnectionEvent} from "./ConnectionEvent.js"

export class ConnectionStats {
  openCount = 0
  closeCount = 0
  errorCount = 0
  publishCount = 0
  requestCount = 0
  eventCount = 0
  lastOpen = 0
  lastClose = 0
  lastError = 0
  lastPublish = 0
  lastRequest = 0
  lastEvent = 0
  lastAuth = 0
  publishTimer = 0
  publishSuccessCount = 0
  publishFailureCount = 0
  eoseCount = 0
  eoseTimer = 0
  noticeCount = 0

  constructor(readonly cxn: Connection) {
    cxn.on(ConnectionEvent.Open, (cxn: Connection) => {
      this.openCount++
      this.lastOpen = Date.now()
    })

    cxn.on(ConnectionEvent.Close, (cxn: Connection) => {
      this.closeCount++
      this.lastClose = Date.now()
    })

    cxn.on(ConnectionEvent.Error, (cxn: Connection) => {
      this.errorCount++
      this.lastError = Date.now()
    })

    cxn.on(ConnectionEvent.Send, (cxn: Connection, [verb]: Message) => {
      if (verb === "REQ") {
        this.requestCount++
        this.lastRequest = Date.now()
      }

      if (verb === "EVENT") {
        this.publishCount++
        this.lastPublish = Date.now()
      }
    })

    cxn.on(ConnectionEvent.Receive, (cxn: Connection, [verb, ...extra]: Message) => {
      if (verb === "OK") {
        const pub = this.cxn.state.pendingPublishes.get(extra[0])

        if (pub) {
          this.publishTimer += Date.now() - pub.sent
        }

        if (extra[1]) {
          this.publishSuccessCount++
        } else {
          this.publishFailureCount++
        }
      }

      if (verb === "AUTH") {
        this.lastAuth = Date.now()
      }

      if (verb === "EVENT") {
        this.eventCount++
        this.lastEvent = Date.now()
      }

      if (verb === "EOSE") {
        const request = this.cxn.state.pendingRequests.get(extra[0])

        // Only count the first eose
        if (request && !request.eose) {
          this.eoseCount++
          this.eoseTimer += Date.now() - request.sent
        }
      }

      if (verb === "NOTICE") {
        this.noticeCount++
      }
    })
  }

  getRequestSpeed = () => (this.eoseCount ? this.eoseTimer / this.eoseCount : 0)

  getPublishSpeed = () =>
    this.publishSuccessCount ? this.publishTimer / this.publishSuccessCount : 0
}
