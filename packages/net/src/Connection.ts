import {Emitter} from '@welshman/lib'
import {normalizeRelayUrl} from '@welshman/util'
import {Socket} from './Socket'
import type {Message} from './Socket'
import {ConnectionEvent} from './ConnectionEvent'
import {ConnectionState} from './ConnectionState'
import {ConnectionStats} from './ConnectionStats'
import {ConnectionAuth} from './ConnectionAuth'
import {ConnectionSender} from './ConnectionSender'

export enum ConnectionStatus {
  Ready = "ready",
  Closed = "Closed",
  Closing = "Closing",
}

const {Ready, Closed, Closing} = ConnectionStatus

export class Connection extends Emitter {
  url: string
  socket: Socket
  sender: ConnectionSender
  state: ConnectionState
  stats: ConnectionStats
  auth: ConnectionAuth
  status = Ready

  constructor(url: string) {
    super()

    if (url !== normalizeRelayUrl(url)) {
      console.warn(`Attempted to open connection to non-normalized url ${url}`)
    }

    this.url = url
    this.socket = new Socket(this)
    this.sender = new ConnectionSender(this)
    this.state = new ConnectionState(this)
    this.stats = new ConnectionStats(this)
    this.auth = new ConnectionAuth(this)
    this.setMaxListeners(100)
  }

  emit = (type: ConnectionEvent, ...args: any[]) => super.emit(type, this, ...args)

  send = async (message: Message) => {
    await this.socket.open()

    if (this.status === Ready) {
      this.sender.push(message)
    }
  }

  close = async () => {
    this.status = Closing

    await this.sender.close()
    await this.socket.close()

    this.status = Closed
    this.removeAllListeners()
  }
}
