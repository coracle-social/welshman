import {Socket} from './util/Socket'
import {EventBus} from './util/EventBus'

export class Relays {
  sockets: Socket[]
  bus: EventBus
  constructor(sockets) {
    this.sockets = sockets
    this.bus = new EventBus()
    this.listeners = sockets.map(socket => {
      return socket.bus.addListener('message', (url, [verb, ...payload]) => {
        this.bus.emit(verb, url, ...payload)
      })
    })
  }
  send(...payload) {
    this.sockets.forEach(async socket => {
      await socket.connect()

      socket.send(payload)
    })
  }
  cleanup() {
    this.bus.clear()
    this.listeners.map(unsubscribe => unsubscribe())
  }
}
