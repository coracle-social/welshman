import {Emitter, addToMapKey} from "@welshman/lib"

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
    let relays = this.relaysById.get(eventId)
    let ids = this.idsByRelay.get(relay)

    if (relays?.has(relay) && ids?.has(eventId)) return

    if (!relays) {
      relays = new Set()
    }

    if (!ids) {
      ids = new Set()
    }

    relays.add(relay)
    ids.add(eventId)

    this.relaysById.set(eventId, relays)
    this.idsByRelay.set(relay, ids)

    this.emit("update")
  }

  removeRelay = (eventId: string, relay: string) => {
    const didDeleteRelay = this.relaysById.get(eventId)?.delete(relay)
    const didDeleteId = this.idsByRelay.get(relay)?.delete(eventId)

    if (!didDeleteRelay && !didDeleteId) return

    this.emit("update")
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

  load = (relaysById: Tracker["relaysById"]) => {
    this.relaysById.clear()
    this.idsByRelay.clear()

    for (const [id, relays] of relaysById.entries()) {
      for (const relay of relays) {
        addToMapKey(this.relaysById, id, relay)
        addToMapKey(this.idsByRelay, relay, id)
      }
    }

    this.emit("update")
  }

  clear = () => {
    this.relaysById.clear()
    this.idsByRelay.clear()

    this.emit("update")
  }
}
