import {EventBus} from "./util/EventBus"

export class Plex {
  constructor(urls, socket) {
    this.urls = urls
    this.socket = socket
    this.bus = new EventBus()
    this.unsubscribe = socket.bus.addListeners({
      message: (websocketUrl, [{relays}, [verb, ...payload]]) => {
        this.bus.emit(verb, relays[0], ...payload)
      },
    })
  }
  async send(...payload) {
    await this.socket.connect()

    this.socket.send([{relays: this.urls}, payload])
  }
  cleanup() {
    this.bus.clear()
    this.unsubscribe()
  }
}
