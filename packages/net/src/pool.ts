import {remove} from "@welshman/lib"
import {normalizeRelayUrl} from "@welshman/util"
import {Socket} from "./socket.js"
import {defaultSocketPolicies} from "./policy.js"

export type PoolSubscription = (socket: Socket) => void

export class Pool {
  socketPolicies = [...defaultSocketPolicies]
  _data = new Map<string, Socket>()
  _subs: PoolSubscription[] = []

  has(url: string) {
    return this._data.has(normalizeRelayUrl(url))
  }

  get(_url: string): Socket {
    const url = normalizeRelayUrl(_url)
    const socket = this._data.get(url)

    if (socket) {
      return socket
    }

    const newSocket = new Socket(url, this.socketPolicies)

    this._data.set(url, newSocket)

    for (const cb of this._subs) {
      cb(newSocket)
    }

    return newSocket
  }

  subscribe(cb: PoolSubscription) {
    this._subs.push(cb)

    return () => {
      this._subs = remove(cb, this._subs)
    }
  }

  remove(url: string) {
    const socket = this._data.get(normalizeRelayUrl(url))

    if (socket) {
      socket.cleanup()

      this._data.delete(normalizeRelayUrl(url))
    }
  }

  clear() {
    for (const url of this._data.keys()) {
      this.remove(url)
    }
  }
}
