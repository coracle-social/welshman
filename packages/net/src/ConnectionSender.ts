import {Worker} from '@welshman/lib'
import {AUTH_JOIN} from '@welshman/util'
import {SocketStatus} from './Socket'
import type {Message} from './Socket'
import type {Connection} from './Connection'
import {AuthStatus} from './ConnectionAuth'

export class ConnectionSender {
  worker: Worker<Message>

  constructor(readonly cxn: Connection) {
    this.worker = new Worker({
      shouldDefer: ([verb, ...extra]: Message) => {
        // If we're not connected, nothing we can do
        if (this.cxn.socket.status !== SocketStatus.Open) return true

        // Always allow sending AUTH
        if (verb === 'AUTH') return false

        // Only close reqs that have been sent
        if (verb === 'CLOSE') return !this.cxn.state.pendingRequests.has(extra[0])

        // Always allow sending join requests
        if (verb === 'EVENT' && extra[0].kind === AUTH_JOIN) return false

        // Wait for auth
        if (![AuthStatus.None, AuthStatus.Ok].includes(this.cxn.auth.status)) return true

        // Limit concurrent requests
        if (verb === 'REQ') return this.cxn.state.pendingRequests.size >= 8

        return false
      },
    })

    this.worker.addGlobalHandler(([verb, ...extra]: Message) => {
      // If we ended up handling a CLOSE before we handled the REQ, don't send the REQ
      if (verb === 'CLOSE') {
        this.worker.buffer = this.worker.buffer.filter(m => !(m[0] === 'REQ' && m[1] === extra[0]))
      }

      this.cxn.socket.send([verb, ...extra])
    })
  }

  push = (message: Message) => {
    this.worker.push(message)
  }

  close = async () => {
    this.worker.pause()
  }
}
