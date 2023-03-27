import {Socket} from "./util/Socket"

export class Pool {
  relays: Map<string, Socket>
  constructor() {
    this.relays = new Map()
    this.interval = setInterval(() => {
      for (const relay of this.relays) {
        relay.reconnect()
      }
    }, 30_000)
  }
  add(url) {
    if (!this.relays.has(url)) {
      this.relays.set(url, new Socket(url))
    }

    return this.relays.get(url)
  }
  remove(url) {
    this.relays.get(url)?.disconnect()
    this.relays.delete(url)
  }
  cleanup() {
    this.interval = clearInterval(this.interval)

    for (const url of this.relays.keys()) {
      this.remove(url)
    }
  }
}
