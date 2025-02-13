import {Worker, complement, spec} from "@welshman/lib"
import {AUTH_JOIN} from "@welshman/util"
import {SocketStatus} from "./Socket.js"
import type {Message} from "./Socket.js"
import type {Connection} from "./Connection.js"
import {AuthStatus} from "./ConnectionAuth.js"

export class ConnectionSender {
  worker: Worker<Message>

  constructor(readonly cxn: Connection) {
    this.worker = new Worker({
      shouldDefer: (message: Message) => {
        const verb = message[0]

        // Always send CLOSE to clean up pending requests
        if (verb === "CLOSE") return false

        // If we're not connected, nothing we can do
        if (cxn.socket.status !== SocketStatus.Open) return true

        // Always allow sending AUTH
        if (verb === "AUTH") return false

        // Always allow sending join requests
        if (verb === "EVENT" && message[1].kind === AUTH_JOIN) return false

        // Wait for auth
        if (![AuthStatus.None, AuthStatus.Ok].includes(cxn.auth.status)) return true

        // Limit concurrent requests
        if (verb === "REQ") return cxn.state.pendingRequests.size >= 50

        return false
      },
    })

    this.worker.addGlobalHandler((message: Message) => {
      const verb = message[0]

      // If we're closing something that never got sent, skip it
      if (verb === "CLOSE" && !cxn.state.pendingRequests.has(message[1])) {
        return
      }

      cxn.socket.send(message)
    })
  }

  push = (message: Message) => {
    // If we ended up handling a CLOSE before we sent the REQ, don't send the REQ
    if (message[0] === "CLOSE") {
      this.worker.buffer = this.worker.buffer.filter(complement(spec(["REQ", message[1]])))
    }

    this.worker.push(message)
  }
}
