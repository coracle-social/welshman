import {Socket} from "./util/Socket"
import {EventEmitter} from 'events'

export class Pool extends EventEmitter {
  data: Map<string, Socket>
  constructor() {
    super()

    this.data = new Map()
  }
  has(url) {
    return this.data.has(url)
  }
  get(url, {autoConnect = true} = {}) {
    if (!this.data.has(url) && autoConnect) {
      const socket = new Socket(url)

      this.data.set(url, socket)
      this.emit('init', {url})

      socket.on('open', () => this.emit('open', {url}))
      socket.on('close', () => this.emit('close', {url}))
    }

    return this.data.get(url)
  }
  remove(url) {
    const socket = this.data.get(url)

    if (socket) {
      socket.removeAllListeners()
      this.data.delete(url)
    }
  }
  clear() {
    for (const url of this.data.keys()) {
      this.remove(url)
    }
  }
}
