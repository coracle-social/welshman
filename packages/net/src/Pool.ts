import {Emitter} from "@welshman/lib"
import {Connection} from "./Connection.js"

export class Pool extends Emitter {
  data: Map<string, Connection>

  constructor() {
    super()

    this.data = new Map()
  }

  has(url: string) {
    return this.data.has(url)
  }

  get(url: string): Connection {
    const oldConnection = this.data.get(url)

    if (oldConnection) {
      return oldConnection
    }

    const newConnection = new Connection(url)

    this.data.set(url, newConnection)
    this.emit("init", newConnection)

    return newConnection
  }

  remove(url: string) {
    const connection = this.data.get(url)

    if (connection) {
      connection.cleanup()

      this.data.delete(url)
    }
  }

  clear() {
    for (const url of this.data.keys()) {
      this.remove(url)
    }
  }
}
