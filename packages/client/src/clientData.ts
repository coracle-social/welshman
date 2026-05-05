import {Subscriber} from 'svelte/store'
import {call} from '@welshman/lib'

export class ClientData<T> {
  selfSubscribers: Subscriber<ClientData<T>>[] = []
  clearSubscribers: Subscriber<ClientData<T>>[] = []
  itemSubscribers: Subscriber<T>[] = []
  data = new Map<string, T>()

  // Svelte store-like methods

  private notify = () => {
    for (const subscriber of this.selfSubscribers) {
      subscriber(this)
    }
  }

  subscribe = (subscriber: Subscriber<ClientData<T>>) => {
    subscriber(this)
    this.selfSubscribers.push(subscriber)

    return () => {
      this.selfSubscribers.splice(this.selfSubscribers.indexOf(subscriber), 1)
    }
  }

  derived = (key: string) => {
    return readable(this.get(key), set => {
      const subscribers = [
        this.onClear(() => set(undefined)),
        this.onItem(set)
      ]

      return () => subscribers.forEach(call)
    })
  }

  // EventEmitter-like methods

  private emitClear = () => {
    for (const subscriber of this.clearSubscribers) {
      subscriber(this)
    }

    this.notify()
  }

  onClear = (subscriber: Subscriber<T>) => {
    this.clearSubscribers.push(subscriber)

    return () => {
      this.clearSubscribers.splice(this.clearSubscribers.indexOf(subscriber), 1)
    }
  }

  private emitItem = (item: T) => {
    for (const subscriber of this.itemSubscribers) {
      subscriber(item)
    }

    this.notify()
  }

  onItem = (subscriber: Subscriber<T>) => {
    this.itemSubscribers.push(subscriber)

    return () => {
      this.itemSubscribers.splice(this.itemSubscribers.indexOf(subscriber), 1)
    }
  }

  // Map-like methods

  clear = () => {
    this.data.clear()
    this.emitClear()
  }

  delete = (key: string) => {
    this.data.delete(key)
    this.emitItem(key, undefined)
  }

  set = (key: string, value: T) => {
    this.data.set(key, value)
    this.emitItem(key, value)
  }

  get = (key: string) => this.data.get(key)
  values = () => this.data.values()
  items = () => this.data.items()
  keys = () => this.data.keys()
}
