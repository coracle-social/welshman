import {Worker} from "@welshman/lib"
import {AUTH_JOIN} from "@welshman/util"
import {SocketStatus} from "./Socket.js"
import type {Message} from "./Socket.js"
import type {Connection} from "./Connection.js"
import {AuthStatus} from "./ConnectionAuth.js"

export class ConnectionSender {
  worker: Worker<Message>

  constructor(readonly cxn: Connection) {
    this.worker = new Worker({
      shouldDefer: ([verb, ...extra]: Message) => {
        // Always send CLOSE to clean up pending requests, even if the connection is closed
        if (verb === "CLOSE") return false

        // If we're not connected, nothing we can do
        if (cxn.socket.status !== SocketStatus.Open) return true

        // Always allow sending AUTH
        if (verb === "AUTH") return false

        // Always allow sending join requests
        if (verb === "EVENT" && extra[0].kind === AUTH_JOIN) return false

        // Wait for auth
        if (![AuthStatus.None, AuthStatus.Ok].includes(cxn.auth.status)) return true

        // Limit concurrent requests
        if (verb === "REQ") return cxn.state.pendingRequests.size >= 8

        return false
      },
    })

    this.worker.addGlobalHandler(([verb, ...extra]: Message) => {
      // If we ended up handling a CLOSE before we handled the REQ, don't send the REQ
      if (verb === "CLOSE") {
        this.worker.buffer = this.worker.buffer.filter(m => !(m[0] === "REQ" && m[1] === extra[0]))
      }

      // Re-check socket status since we let CLOSE through
      if (cxn.socket.status === SocketStatus.Open) {
        cxn.socket.send([verb, ...extra])
      }
    })
  }

  push = (message: Message) => {
    this.worker.push(message)
  }
}
