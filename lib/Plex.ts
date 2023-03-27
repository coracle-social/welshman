import {EventBus} from "./util/EventBus"

export class Plex {
  constructor(urls, socket) {
    this.urls = urls
    this.socket = socket
    this.bus = new EventBus()
    this.onMessage = this.onMessage.bind(this)

    this.socket.bus.on('message', this.onMessage)
  }
  async send(...payload) {
    await this.socket.connect()

    this.socket.send([{relays: this.urls}, payload])
  }
  onMessage(message) {
    const [verb, ...payload] = message[1]

    this.bus.handle(verb, ...payload)
  }
}
