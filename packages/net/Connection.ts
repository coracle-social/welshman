import {Emitter, Worker} from '@welshman/lib'
import {AuthStatus, ConnectionMeta} from './ConnectionMeta'
import {Socket, isMessage, asMessage} from './Socket'
import type {SocketMessage} from './Socket'

export class Connection extends Emitter {
  url: string
  socket: Socket
  sender: Worker<SocketMessage>
  receiver: Worker<SocketMessage>
  meta: ConnectionMeta

  constructor(url: string) {
    super()

    this.url = url
    this.socket = new Socket(url, this)
    this.sender = this.createSender()
    this.receiver = this.createReceiver()
    this.meta = new ConnectionMeta(this)
    this.setMaxListeners(100)
  }

  createSender = () => {
    const worker = new Worker<SocketMessage>({
      shouldDefer: (message: SocketMessage) => {
        if (!this.socket.isReady()) {
          return true
        }

        const [verb, ...extra] = asMessage(message)

        if (['AUTH', 'CLOSE'].includes(verb)) {
          return false
        }

        // Allow relay requests through
        if (verb === 'EVENT' && extra[0].kind === 28934) {
          return false
        }

        // Only defer for auth if we're not multiplexing
        if (isMessage(message) && ![AuthStatus.Ok, AuthStatus.Pending].includes(this.meta.authStatus)) {
          return true
        }

        if (verb === 'REQ') {
          return this.meta.pendingRequests.size >= 8
        }

        return false
      }
    })

    worker.addGlobalHandler((message: SocketMessage) => {
      // If we ended up handling a CLOSE before we handled the REQ, don't send the REQ
      if (message[0] === 'CLOSE') {
        worker.buffer = worker.buffer.filter(m => !(m[0] === 'REQ' && m[1] === message[1]))
      }

      this.onSend(message)
    })

    return worker
  }

  createReceiver = () => {
    const worker = new Worker<SocketMessage>()

    worker.addGlobalHandler(this.onReceive)

    return worker
  }

  send = (m: SocketMessage) => this.sender.push(m)

  onOpen = () => this.emit('open', this)

  onClose = () => this.emit('close', this)

  onError = () => this.emit('fault', this)

  onMessage = (m: SocketMessage) => this.receiver.push(m)

  onSend = (message: SocketMessage) => {
    this.emit('send', this, message)
    this.socket.send(message)
  }

  onReceive = (message: SocketMessage) => {
    this.emit('receive', this, message)
  }

  ensureConnected = ({shouldReconnect = true}) => {
    if (shouldReconnect && !this.socket.isHealthy()) {
      this.disconnect()
    }

    if (this.socket.isPending()) {
      this.socket.connect()
    }
  }

  disconnect() {
    this.socket.disconnect()
    this.sender.clear()
    this.receiver.clear()
    this.meta.clearPending()
  }

  destroy() {
    this.disconnect()
    this.removeAllListeners()
    this.sender.stop()
    this.receiver.stop()
  }
}
