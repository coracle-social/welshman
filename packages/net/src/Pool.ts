import {remove} from "@welshman/lib"
import {normalizeRelayUrl} from "@welshman/util"
import {Socket} from "./socket.js"
import {AuthState} from "./auth.js"
import {defaultSocketPolicies} from "./policy.js"

export const makeSocket = (url: string, policies = defaultSocketPolicies) => {
  const socket = new Socket(url)

  for (const applyPolicy of policies) {
    applyPolicy(socket)
  }

  return socket
}

export type PoolSubscription = (socket: Socket) => void

export type PoolOptions = {
  makeSocket?: (url: string) => Socket
}

export let poolSingleton: Pool

export type PoolItem = {
  socket: Socket
  auth: AuthState
}

export class Pool {
  _data = new Map<string, PoolItem>()
  _subs: PoolSubscription[] = []

  static getSingleton() {
    if (!poolSingleton) {
      poolSingleton = new Pool()
    }

    return poolSingleton
  }

  constructor(readonly options: PoolOptions = {}) {}

  has(url: string) {
    return this._data.has(normalizeRelayUrl(url))
  }

  makeSocket(url: string) {
    if (this.options.makeSocket) {
      return this.options.makeSocket(url)
    }

    return makeSocket(url)
  }

  get(_url: string): Socket {
    const url = normalizeRelayUrl(_url)
    const item = this._data.get(url)

    if (item) {
      return item.socket
    }

    const socket = this.makeSocket(url)

    this._data.set(url, {socket, auth: new AuthState(socket)})

    for (const cb of this._subs) {
      cb(socket)
    }

    return socket
  }

  getAuth(url: string) {
    return this._data.get(normalizeRelayUrl(url))?.auth
  }

  subscribe(cb: PoolSubscription) {
    this._subs.push(cb)

    return () => {
      this._subs = remove(cb, this._subs)
    }
  }

  remove(url: string) {
    const item = this._data.get(url)

    if (item) {
      item.socket.cleanup()
      item.auth.cleanup()

      this._data.delete(url)
    }
  }

  clear() {
    for (const url of this._data.keys()) {
      this.remove(url)
    }
  }
}
