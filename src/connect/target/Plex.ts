import {Emitter} from '../util/Emitter'
import type {PlexMessage, Message} from '../connect/Socket'
import {Connection} from '../connect/Connection'

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
