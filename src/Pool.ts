import {Socket} from "./util/Socket"

export class Pool {
  data: Map<string, Socket>
  constructor() {
    this.data = new Map()
  }
  has(url) {
    return this.data.has(url)
  }
  get(url) {
    if (!this.data.has(url)) {
      this.data.set(url, new Socket(url))
    }

    return this.data.get(url)
  }
  remove(url) {
    const socket = this.data.get(url)

    if (socket) {
      socket.disconnect()
      this.data.delete(url)
    }
  }
  clear() {
    for (const url of this.data.keys()) {
      this.remove(url)
    }
  }
}
