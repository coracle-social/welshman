import {Relay} from "./Relay"

const normalizeUrl = url => url.replace(/\/+$/, "").toLowerCase().trim()

export class Pool {
  relays: Map<string, Relay>
  constructor() {
    this.relays = new Map()
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
  async waitFor(url) {
    const relay = this.add(url)

    await relay.connect()

    return relay.status === Relay.STATUS.READY ? relay : null
  }
  async execute(urls, callback) {
    const results = await Promise.all([
      urls.map(async url => {
        const relay = await this.waitFor(url)

        if (!relay) {
          return null
        }

        return [relay, callback(relay)]
      }),
    ])

    return results.filter(Boolean)
  }
}
