import {Emitter} from '@welshman/lib'

export class Tracker extends Emitter {
  data = new Map<string, Set<string>>()

  constructor() {
    super()

    this.setMaxListeners(100)
  }

  getRelays = (eventId: string) => {
    const relays = new Set<string>()

    for (const relay of this.data.get(eventId) || []) {
      relays.add(relay)
    }

    return relays
  }

  hasRelay = (eventId: string, relay: string) => {
    return this.getRelays(eventId).has(relay)
  }

  addRelay = (eventId: string, relay: string) => {
    const relays = this.data.get(eventId) || new Set()

    relays.add(relay)

    this.data.set(eventId, relays)
    this.emit('update')
  }

  track = (eventId: string, relay: string) => {
    const seen = this.data.has(eventId)

    this.addRelay(eventId, relay)

    return seen
  }

  copy = (eventId1: string, eventId2: string) => {
    for (const relay of this.getRelays(eventId1)) {
      this.addRelay(eventId2, relay)
    }
  }

  clear = () => {
    this.data.clear()
    this.emit('update')
  }
}
