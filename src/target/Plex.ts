import {EventEmitter} from 'events'
import {Connection} from '../Connection'
import type {PlexMessage, Message} from '../util/Socket'

export class Plex extends EventEmitter {
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
