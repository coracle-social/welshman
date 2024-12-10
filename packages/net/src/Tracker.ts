import {Emitter, addToMapKey} from '@welshman/lib'

export class Tracker extends Emitter {
  relaysById = new Map<string, Set<string>>()
  idsByRelay = new Map<string, Set<string>>()

  constructor() {
    super()

    this.setMaxListeners(100)
  }

  getIds = (relay: string) => this.idsByRelay.get(relay) || new Set<string>()

  getRelays = (eventId: string) => this.relaysById.get(eventId) || new Set<string>()

  hasRelay = (eventId: string, relay: string) => this.relaysById.get(eventId)?.has(relay)

  addRelay = (eventId: string, relay: string) => {
    const relays = this.relaysById.get(eventId) || new Set()
    const ids = this.idsByRelay.get(relay) || new Set()

    relays.add(relay)
    ids.add(eventId)

    this.relaysById.set(eventId, relays)
    this.idsByRelay.set(eventId, relays)

    this.emit('update')
  }

  removeRelay = (eventId: string, relay: string) => {
    this.relaysById.get(eventId)?.delete(relay)
    this.idsByRelay.get(relay)?.delete(eventId)

    this.emit('update')
  }

  track = (eventId: string, relay: string) => {
    const seen = this.relaysById.has(eventId)

    this.addRelay(eventId, relay)

    return seen
  }

  copy = (eventId1: string, eventId2: string) => {
    for (const relay of this.getRelays(eventId1)) {
      this.addRelay(eventId2, relay)
    }
  }

  load = (relaysById: Tracker['relaysById']) => {
    this.relaysById.clear()
    this.idsByRelay.clear()

    for (const [id, relays] of relaysById.entries()) {
      for (const relay of relays) {
        addToMapKey(this.relaysById, id, relay)
        addToMapKey(this.idsByRelay, relay, id)
      }
    }

    this.emit('update')
  }

  clear = () => {
    this.relaysById.clear()
    this.idsByRelay.clear()

    this.emit('update')
  }
}
