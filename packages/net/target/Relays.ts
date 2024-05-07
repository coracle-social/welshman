import {Emitter} from '@welshman/lib'
import type {Message} from '../Socket'
import type {Connection} from '../Connection'

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
