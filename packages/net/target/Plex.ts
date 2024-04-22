import {Emitter} from '@welshman/lib'
import type {Message} from '@welshman/util'
import type {PlexMessage} from '../Socket'
import type {Connection} from '../Connection'

export class Plex extends Emitter {
  constructor(readonly urls: string[], readonly connection: Connection) {
    super()

    this.connection.on('receive', this.onMessage)
  }

  get connections() {
    return [this.connection]
  }

  send = (...payload: Message) => {
    this.connection.send([{relays: this.urls}, payload])
  }

  onMessage = (connection: Connection, [{relays}, [verb, ...payload]]: PlexMessage) => {
    this.emit(verb, relays[0], ...payload)
  }

  cleanup = () => {
    this.removeAllListeners()
    this.connection.off('receive', this.onMessage)
  }
}
