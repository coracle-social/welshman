import {Emitter} from '@welshman/lib'
import type {Message} from '../Socket'

export class Echo extends Emitter {
  get connections() {
    return []
  }

  send(...payload: Message) {
    this.emit(...payload)
  }

  cleanup = () => {
    this.removeAllListeners()
  }
}
