export type EventBusHandler = (...args: any[]) => void

export class EventBus {
  static ANY = Math.random().toString().slice(2)
  listeners: Record<string, Array<EventBusHandler>> = {}
  on(name: string, handler: EventBusHandler) {
    this.listeners[name] = this.listeners[name] || ([] as Array<EventBusHandler>)
    this.listeners[name].push(handler)
  }
  off(name: string, handler: EventBusHandler) {
    this.listeners[name] = this.listeners[name].filter(h => h !== handler)
  }
  clear() {
    this.listeners = {}
  }
  handle(k: string, ...payload: any) {
    for (const handler of this.listeners[k] || []) {
      handler(...payload)
    }

    for (const handler of this.listeners[EventBus.ANY] || []) {
      handler(k, ...payload)
    }
  }
  pipe(k: string, bus: EventBus) {
    this.on(k, (...payload: any[]) => bus.handle(k, ...payload))
  }
}
