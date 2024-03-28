import {writable} from '@coracle.social/lib'

export class Tracker {
  links: Tracker[] = []
  data = writable(new Map<string, Set<string>>())

  getRelays = (eventId: string) => {
    const relays = new Set<string>()

    for (const relay of this.data.get().get(eventId) || []) {
      relays.add(relay)
    }

    for (const link of this.links) {
      for (const relay of link.getRelays(eventId)) {
        relays.add(relay)
      }
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
    if (this.hasRelay(eventId, relay)) return true

    this.addRelay(eventId, relay)

    return false
  }

  link = (tracker: Tracker) => this.links.push(tracker)

  copy = (eventId1: string, eventId2: string) => {
    for (const relay of this.getRelays(eventId1)) {
      this.addRelay(eventId2, relay)
    }
  }
}
