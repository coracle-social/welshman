export type EventBusHandler = (...args: any[]) => void

export class EventBus {
  static ANY = Math.random().toString().slice(2)
  listeners: Record<string, Array<EventBusHandler>> = {}
  addListener(name: string, handler: EventBusHandler) {
    this.listeners[name] = this.listeners[name] || ([] as Array<EventBusHandler>)
    this.listeners[name].push(handler)

    return () => this.removeListener(name, handler)
  }
  addListeners(config: Record<string, EventBusHandler>) {
    const callbacks = [] as Array<() => void>
    for (const [name, handler] of Object.entries(config)) {
      callbacks.push(this.addListener(name, handler))
    }

    return () => callbacks.forEach(unsubscribe => unsubscribe())
  }
  removeListener(name: string, handler: EventBusHandler) {
    this.listeners[name] = (this.listeners[name] || []).filter(h => h !== handler)
  }
  clear() {
    this.listeners = {}
  }
  emit(k: string, ...payload: any) {
    for (const handler of this.listeners[k] || []) {
      handler(...payload)
    }

    for (const handler of this.listeners[EventBus.ANY] || []) {
      handler(k, ...payload)
    }
  }
}
