import {Socket} from './util/Socket'
import {EventBus} from './util/EventBus'

export class Relays {
  sockets: Socket[]
  bus: EventBus
  constructor(sockets) {
    this.sockets = sockets
    this.bus = new EventBus()
    this.onMessage = this.onMessage.bind(this)

    sockets.forEach(socket => socket.bus.on('message', this.onMessage))
  }
  send(...payload) {
    this.sockets.forEach(socket => {
      await socket.connect()

      socket.send(...payload)
    })
  }
  onMessage(message) {
    const [verb, ...payload] = message

    this.bus.handle(verb, ...payload)
  }
}
