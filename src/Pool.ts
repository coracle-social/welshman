import {Socket} from "./util/Socket"
import {EventBus} from "./util/EventBus"

export class Pool {
  data: Map<string, Socket>
  constructor() {
    this.data = new Map()
    this.bus = new EventBus()
  }
  has(url) {
    return this.data.has(url)
  }
  get(url) {
    if (!this.data.has(url)) {
      const socket = new Socket(url)

      this.data.set(url, socket)

      socket.bus.addListeners({
        open: () => this.bus.emit('open', {url}),
        close: () => this.bus.emit('close', {url}),
      })
    }

    return this.data.get(url)
  }
  remove(url) {
    const socket = this.data.get(url)

    if (socket) {
      socket.cleanup()
      this.data.delete(url)
    }
  }
  clear() {
    for (const url of this.data.keys()) {
      this.remove(url)
    }
  }
}
