import {Emitter} from "@welshman/lib"
import type {Message} from "../Socket.js"

export class Echo extends Emitter {
  get connections() {
    return []
  }

  async send(...payload: Message) {
    this.emit(...payload)
  }

  cleanup = () => {
    this.removeAllListeners()
  }
}
