import {EventEmitter} from 'events'

export class Emitter extends EventEmitter {
  emit(type: string, ...args: any[]) {
    const a = super.emit(type, ...args)
    const b = super.emit('*', type, ...args)

    return a && b
  }
}
