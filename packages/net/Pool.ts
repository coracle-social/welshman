import {Emitter} from '@welshman/lib'
import {Connection} from "./Connection"

export class Pool extends Emitter {
  data: Map<string, Connection>
  constructor() {
    super()

    this.data = new Map()
  }
  has(url: string) {
    return this.data.has(url)
  }
  get(url: string, {autoConnect = true, reconnectAfter = 3000} = {}): Connection {
    let connection = this.data.get(url)

    if (autoConnect) {
      if (!connection) {
        connection = new Connection(url)

        this.data.set(url, connection)
        this.emit('init', connection)

        connection.on('open', () => this.emit('open', connection))
        connection.on('close', () => this.emit('close', connection))
      }

      connection.ensureConnected({
        shouldReconnect: connection.meta.lastClose < Date.now() - reconnectAfter,
      })
    }

    return connection!
  }
  remove(url: string) {
    const connection = this.data.get(url)

    if (connection) {
      connection.destroy()

      this.data.delete(url)
    }
  }
  clear() {
    for (const url of this.data.keys()) {
      this.remove(url)
    }
  }
}
