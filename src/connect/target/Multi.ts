import {Emitter} from '../../util/Emitter'
import type {Target} from '../Executor'
import type {Message} from '../Socket'

export class Multi extends Emitter {
  constructor(readonly targets: Target[]) {
    super()

    targets.forEach(t => {
      t.on('*', (verb, ...args) => this.emit(verb, ...args))
    })
  }

  get connections() {
    return this.targets.flatMap(t => t.connections)
  }

  send(...payload: Message) {
    this.targets.forEach(t => t.send(...payload))
  }

  cleanup = () => {
    this.removeAllListeners()
    this.targets.forEach(t => t.cleanup())
  }
}
