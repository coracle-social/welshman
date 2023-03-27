import type {Relay} from './Relay'
import {EventBus} from './util/EventBus'

export class RelaySet {
  relays: Relay[]
  bus: EventBus
  constructor(relays) {
    this.relays = relays
    this.bus = new EventBus()

    relays.forEach(relay => {
      relay.bus.pipe(EventBus.ANY, this.bus)
    })
  }
  send(...payload) {
    this.relays.forEach(async relay => {
      await relay.connect()

      if (relay.status === Relay.STATUS.READY) {
        relay.send(...payload)
      }
    })
  }
}
