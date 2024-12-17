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
  Open = "open",
  Closed = "Closed",
}

const {Open, Closed} = ConnectionStatus

export class Connection extends Emitter {
  url: string
  socket: Socket
  sender: ConnectionSender
  state: ConnectionState
  stats: ConnectionStats
  auth: ConnectionAuth
  status = Open

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
    if (this.status !== Open) {
      throw new Error(`Attempted to send message on ${this.status} connection`)
    }

    this.sender.push(message)
  }

  open = () => {
    this.status = Open
    this.socket.open()
    this.sender.worker.resume()
  }

  close = () => {
    this.status = Closed
    this.socket.close()
    this.sender.worker.pause()
  }

  cleanup = () => {
    this.close()
    this.removeAllListeners()
  }
}
