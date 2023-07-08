import {EventEmitter} from 'events'

export class Plex extends EventEmitter {
  constructor(urls, socket) {
    super()

    this.urls = urls
    this.socket = socket
    this.socket.on('message', this.onMessage)
  }
  get sockets() {
    return [this.socket]
  }
  send = (...payload) => {
    this.socket.send([{relays: this.urls}, payload])
  }
  onMessage = (websocketUrl, [{relays}, [verb, ...payload]]) => {
    this.emit(verb, relays[0], ...payload)
  }
  cleanup = () => {
    this.socket.off('message', this.onMessage)
  }
}
