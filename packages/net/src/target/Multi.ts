import {Emitter} from "@welshman/lib"
import type {Message} from "../Socket.js"
import type {Target} from "../Executor.js"

export class Multi extends Emitter {
  constructor(readonly targets: Target[]) {
    super()

    targets.forEach(t => {
      t.on("*", (verb, ...args) => this.emit(verb, ...args))
    })
  }

  get connections() {
    return this.targets.flatMap(t => t.connections)
  }

  async send(...payload: Message) {
    await Promise.all(this.targets.map(t => t.send(...payload)))
  }

  cleanup = () => {
    this.removeAllListeners()
    this.targets.forEach(t => t.cleanup())
  }
}
