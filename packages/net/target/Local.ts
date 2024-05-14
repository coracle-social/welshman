import {Emitter} from '@welshman/lib'
import {Repository, LOCAL_RELAY_URL, Relay} from '@welshman/util'
import type {Message} from '../Socket'

export class Local extends Emitter {
  relay: Relay
  constructor(readonly repository: Repository) {
    super()

    this.relay = new Relay(repository)
    this.relay.on('*', this.onMessage)
  }

  get connections() {
    return []
  }

  send(...payload: Message) {
    this.relay.send(...payload)
  }

  onMessage = (...message: Message) => {
    const [verb, ...payload] = message

    this.emit(verb, LOCAL_RELAY_URL, ...payload)
  }

  cleanup = () => {
    this.removeAllListeners()
    this.relay.off('*', this.onMessage)
  }
}
