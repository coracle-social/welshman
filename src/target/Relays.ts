import type {Connection} from '../Connection'
import type {Message} from '../util/Socket'
import {Emitter} from '../util/Emitter'

export class Relays extends Emitter {
  constructor(readonly connections: Connection[]) {
    super()

    connections.forEach(connection => {
      connection.on('receive', this.onMessage)
    })
  }

  send = (...payload: Message) => {
    this.connections.forEach(connection => {
      connection.send(payload)
    })
  }

  onMessage = (connection: Connection, [verb, ...payload]: Message) => {
    this.emit(verb, connection.url, ...payload)
  }

  cleanup = () => {
    this.removeAllListeners()
    this.connections.forEach(connection => {
      connection.off('receive', this.onMessage)
    })
  }
}
