export type EventBusHandler = (...args: any[]) => void
export type EventBusListener = {
  id: string
  handler: EventBusHandler
}

export class EventBus {
  static ANY = Math.random().toString().slice(2)
  listeners: Record<string, Array<EventBusListener>> = {}
  on(name: string, handler: EventBusHandler) {
    const id = Math.random().toString().slice(2)

    this.listeners[name] = this.listeners[name] || ([] as Array<EventBusListener>)
    this.listeners[name].push({id, handler})

    return id
  }
  off(name: string, id: string) {
    this.listeners[name] = this.listeners[name].filter(l => l.id !== id)
  }
  clear() {
    this.listeners = {}
  }
  handle(k: string, ...payload: any) {
    for (const {handler} of this.listeners[k] || []) {
      handler(...payload)
    }

    for (const {handler} of this.listeners[EventBus.ANY] || []) {
      handler(k, ...payload)
    }
  }
  pipe(k: string, bus: EventBus) {
    this.on(k, (...payload: any[]) => bus.handle(k, ...payload))
  }
}
