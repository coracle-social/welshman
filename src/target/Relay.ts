import type {Connection} from '../Connection'
import type {Message} from '../util/Socket'
import {Emitter} from '../util/Emitter'

export class Relay extends Emitter {
  constructor(readonly connection: Connection) {
    super()

    this.connection.on('receive', this.onMessage)
  }

  get connections() {
    return [this.connection]
  }

  send(...payload: Message) {
    this.connection.send(payload)
  }

  onMessage = (connection: Connection, [verb, ...payload]: Message) => {
    this.emit(verb, connection.url, ...payload)
  }

  cleanup = () => {
    this.removeAllListeners()
    this.connection.off('receive', this.onMessage)
  }
}
