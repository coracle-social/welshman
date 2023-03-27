import {Relay} from "./Relay"

const normalizeUrl = url => url.replace(/\/+$/, "").toLowerCase().trim()

export class Pool {
  relays: Map<string, Relay>
  constructor() {
    this.relays = new Map()
    this.interval = setInterval(() => {
      for (const relay of this.relays) {
        relay.reconnect()
      }
    }, 30_000)
  }
  add(url) {
    url = normalizeUrl(url)

    if (!this.relays.has(url)) {
      this.relays.set(url, new Relay(url))
    }

    return this.relays.get(url)
  }
  remove(url) {
    url = normalizeUrl(url)

    this.relays.get(url)?.disconnect()
    this.relays.delete(url)
  }
  cleanup() {
    this.interval = clearInterval(this.interval)

    for (const url of this.relays.keys()) {
      this.remove(url)
    }
  }
  async waitFor(url) {
    const relay = this.add(url)

    await relay.connect()

    return relay.status === Relay.STATUS.READY ? relay : null
  }
}
