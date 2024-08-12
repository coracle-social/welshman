import {Emitter} from '@welshman/lib'
import type {TrustedEvent} from '@welshman/util'
import {Relay, LOCAL_RELAY_URL} from '@welshman/util'
import type {Message} from '../Socket'

export class Local<T extends TrustedEvent> extends Emitter {
  constructor(readonly relay: Relay<T>) {
    super()

    relay.on('*', this.onMessage)
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
