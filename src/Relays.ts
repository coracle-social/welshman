import {EventEmitter} from 'events'

export class Relays extends EventEmitter {
  constructor(sockets) {
    super()

    this.sockets = sockets
    this.sockets.forEach(socket => {
      socket.on('message', this.onMessage)
    })
  }
  send = (...payload) => {
    this.sockets.forEach(socket => {
      socket.send(payload)
    })
  }
  onMessage = (url, [verb, ...payload]) => {
    this.emit(verb, url, ...payload)
  }
  cleanup = () => {
    this.sockets.forEach(socket => {
      socket.off('message', this.onMessage)
    })
  }
}
