import {Emitter} from "@welshman/lib"
import type {Message} from "../Socket.js"
import type {Connection} from "../Connection.js"
import {ConnectionEvent} from "../ConnectionEvent.js"

export class Relays extends Emitter {
  constructor(readonly connections: Connection[]) {
    super()

    connections.forEach(connection => {
      connection.on(ConnectionEvent.Receive, this.onMessage)
    })
  }

  async send(...payload: Message) {
    await Promise.all(this.connections.map(c => c.send(payload)))
  }

  onMessage = (connection: Connection, [verb, ...payload]: Message) => {
    this.emit(verb, connection.url, ...payload)
  }

  cleanup = () => {
    this.removeAllListeners()
    this.connections.forEach(connection => {
      connection.off(ConnectionEvent.Receive, this.onMessage)
    })
  }
}
