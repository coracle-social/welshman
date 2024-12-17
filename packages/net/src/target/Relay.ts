import {Emitter} from "@welshman/lib"
import {ConnectionEvent} from "../ConnectionEvent.js"
import type {Message} from "../Socket.js"
import type {Connection} from "../Connection.js"

export class Relay extends Emitter {
  constructor(readonly connection: Connection) {
    super()

    this.connection.on(ConnectionEvent.Receive, this.onMessage)
  }

  get connections() {
    return [this.connection]
  }

  async send(...payload: Message) {
    await this.connection.send(payload)
  }

  onMessage = (connection: Connection, [verb, ...payload]: Message) => {
    this.emit(verb, connection.url, ...payload)
  }

  cleanup = () => {
    this.removeAllListeners()
    this.connection.off(ConnectionEvent.Receive, this.onMessage)
  }
}
