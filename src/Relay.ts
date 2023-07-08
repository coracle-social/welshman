import {EventEmitter} from 'events'

export class Relay extends EventEmitter {
  constructor(socket) {
    super()

    this.socket = socket
    this.socket.on('message', this.onMessage)
  }
  get sockets() {
    return [this.socket]
  }
  send(...payload) {
    this.socket.send(payload)
  }
  onMessage = (url, [verb, ...payload]) => {
    this.emit(verb, url, ...payload)
  }
  cleanup = () => {
    this.socket.off('message', this.onMessage)
  }
}
