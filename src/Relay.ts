import {EventEmitter} from 'events'

export class Relay extends EventEmitter {
  constructor(socket) {
    super()

    this.socket = socket
    this.socket.on('receive', this.onMessage)
  }
  get sockets() {
    return [this.socket]
  }
  send(...payload) {
    this.socket.send(payload)
  }
  onMessage = (socket, [verb, ...payload]) => {
    this.emit(verb, socket.url, ...payload)
  }
  cleanup = () => {
    this.removeAllListeners()
    this.socket.off('receive', this.onMessage)
  }
}
