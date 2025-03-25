import {remove} from "@welshman/lib"
import {normalizeRelayUrl} from "@welshman/util"
import {Socket} from "./socket.js"
import {defaultSocketPolicies} from "./policy.js"

export type PoolSubscription = (socket: Socket) => void

export type PoolOptions = {
  makeSocket?: (url: string) => Socket
}

export class Pool {
  _data = new Map<string, Socket>()
  _subs: PoolSubscription[] = []

  constructor(readonly options: PoolOptions) {}

  has(url: string) {
    return this._data.has(url)
  }

  makeSocket(url: string) {
    if (this.options.makeSocket) {
      return this.options.makeSocket(url)
    }

    return new Socket(url, defaultSocketPolicies)
  }

  get(_url: string): Socket {
    const url = normalizeRelayUrl(_url)
    const oldSocket = this._data.get(url)

    if (oldSocket) {
      return oldSocket
    }

    const socket = this.makeSocket(url)

    this._data.set(url, socket)

    for (const cb of this._subs) {
      cb(socket)
    }

    return socket
  }

  subscribe(cb: PoolSubscription) {
    this._subs.push(cb)

    return () => {
      this._subs = remove(cb, this._subs)
    }
  }

  remove(url: string) {
    const socket = this._data.get(url)

    if (socket) {
      socket.complete()

      this._data.delete(url)
    }
  }

  clear() {
    for (const url of this._data.keys()) {
      this.remove(url)
    }
  }
}
