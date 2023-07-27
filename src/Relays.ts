import {EventEmitter} from 'events'

export class Relays extends EventEmitter {
  constructor(sockets) {
    super()

    this.sockets = sockets
    this.sockets.forEach(socket => {
      socket.on('receive', this.onMessage)
    })
  }
  send = (...payload) => {
    this.sockets.forEach(socket => {
      socket.send(payload)
    })
  }
  onMessage = (socket, [verb, ...payload]) => {
    this.emit(verb, socket.url, ...payload)
  }
  cleanup = () => {
    this.removeAllListeners()
    this.sockets.forEach(socket => {
      socket.off('receive', this.onMessage)
    })
  }
}
