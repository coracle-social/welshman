export type EventBusListener = {
  id: string
  handler: (...args: any[]) => void
}

export class EventBus {
  listeners: Record<string, Array<EventBusListener>> = {}
  on(name, handler) {
    const id = Math.random().toString().slice(2)

    this.listeners[name] = this.listeners[name] || ([] as Array<EventBusListener>)
    this.listeners[name].push({id, handler})

    return id
  }
  off(name, id) {
    this.listeners[name] = this.listeners[name].filter(l => l.id !== id)
  }
  handle(k, ...payload) {
    for (const {handler} of this.listeners[k] || []) {
      handler(...payload)
    }
  }
}
