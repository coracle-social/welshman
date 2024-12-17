import {EventEmitter} from "events"

/**
 * Extended EventEmitter that also emits all events to '*' listeners
 */
export class Emitter extends EventEmitter {
  /**
   * Emits an event to listeners and to '*' listeners
   * @param type - Event type/name
   * @param args - Arguments to pass to listeners
   * @returns True if event had listeners
   */
  emit(type: string, ...args: any[]) {
    const a = super.emit(type, ...args)
    const b = super.emit("*", type, ...args)

    return a && b
  }
}
