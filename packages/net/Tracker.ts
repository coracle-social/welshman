import {writable} from '@welshman/lib'

export class Tracker {
  data = writable(new Map<string, Set<string>>())

  getRelays = (eventId: string) => {
    const relays = new Set<string>()

    for (const relay of this.data.get().get(eventId) || []) {
      relays.add(relay)
    }

    return relays
  }

  hasRelay = (eventId: string, relay: string) => {
    return this.getRelays(eventId).has(relay)
  }

  addRelay = (eventId: string, relay: string) => {
    const relays = this.data.get().get(eventId) || new Set()

    relays.add(relay)

    this.data.update(m => {
      m.set(eventId, relays)

      return m
    })
  }

  track = (eventId: string, relay: string) => {
    const seen = this.data.get().has(eventId)

    this.addRelay(eventId, relay)

    return seen
  }

  copy = (eventId1: string, eventId2: string) => {
    for (const relay of this.getRelays(eventId1)) {
      this.addRelay(eventId2, relay)
    }
  }

  clear = () => {
    this.data.update(m => {
      m.clear()

      return m
    })
  }
}
