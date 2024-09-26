import {ctx} from '@welshman/lib'
import type {Emitter} from '@welshman/lib'
import type {SignedEvent, Filter} from '@welshman/util'
import type {Message} from './Socket'
import type {Connection} from './Connection'
import {Negentropy, NegentropyStorageVector} from './Negentropy'

export type Target = Emitter & {
  connections: Connection[]
  send: (...args: Message) => void
  cleanup: () => void
}

type EventCallback = (url: string, event: SignedEvent) => void
type EoseCallback = (url: string) => void
type CloseCallback = () => void
type OkCallback = (url: string, id: string, ...extra: any[]) => void
type ErrorCallback = (url: string, id: string, ...extra: any[]) => void
type DiffMessageCallback = (url: string, {have, need}: {have: string[], need: string[]}) => void
type SubscribeOpts = {onEvent?: EventCallback, onEose?: EoseCallback}
type PublishOpts = {verb?: string, onOk?: OkCallback, onError?: ErrorCallback}
type DiffOpts = {onError?: ErrorCallback, onMessage?: DiffMessageCallback, onClose?: CloseCallback}

const createSubId = (prefix: string) => [prefix, Math.random().toString().slice(2, 10)].join('-')

export class Executor {

  constructor(readonly target: Target) {
    target.on('AUTH', ctx.net.onAuth)
    target.on('OK', ctx.net.onOk)
  }

  subscribe(filters: Filter[], {onEvent, onEose}: SubscribeOpts = {}) {
    let closed = false

    const id = createSubId('REQ')

    const eventListener = (url: string, subid: string, e: SignedEvent) => {
      if (subid === id) {
        ctx.net.onEvent(url, e)
        onEvent?.(url, e)
      }
    }

    const eoseListener = (url: string, subid: string) => {
      if (subid === id) {
        onEose?.(url)
      }
    }

    this.target.on('EVENT', eventListener)
    this.target.on('EOSE', eoseListener)
    this.target.send("REQ", id, ...filters)

    return {
      unsubscribe: () => {
        if (closed) return

        this.target.send("CLOSE", id)
        this.target.off('EVENT', eventListener)
        this.target.off('EOSE', eoseListener)

        closed = true
      },
    }
  }

  publish(event: SignedEvent, {verb = 'EVENT', onOk, onError}: PublishOpts = {}) {
    const okListener = (url: string, id: string, ...payload: any[]) => {
      if (id === event.id) {
        ctx.net.onEvent(url, event)
        onOk?.(url, id, ...payload)
      }
    }

    const errorListener = (url: string, id: string, ...payload: any[]) => {
      if (id === event.id) {
        onError?.(url, id, ...payload)
      }
    }

    this.target.on('OK', okListener)
    this.target.on('ERROR', errorListener)
    this.target.send(verb, event)

    return {
      unsubscribe: () => {
        this.target.off('OK', okListener)
        this.target.off('ERROR', errorListener)
      }
    }
  }

  diff(filter: Filter, events: SignedEvent[], {onMessage, onError, onClose}: DiffOpts = {}) {
    let closed = false

    const id = createSubId('NEG')
    const storage = new NegentropyStorageVector()
    const neg = new Negentropy(storage, 50_000)

    for (const event of events) {
      storage.insert(event.created_at, event.id)
    }

    storage.seal()

    const msgListener = async (url: string, negid: string, msg: string) => {
      if (negid === id) {
        const [newMsg, have, need] = await neg.reconcile(msg)

        onMessage?.(url, {have, need})

        if (newMsg) {
          this.target.send('NEG-MSG', id, newMsg)
        } else {
          close()
        }
      }
    }

    const errListener = (url: string, negid: string, msg: string) => {
      if (negid === id) {
        onError?.(url, msg)
      }
    }

    const close = () => {
      if (closed) return

      this.target.send('NEG-CLOSE', id)
      this.target.off('NEG-MSG', msgListener)
      this.target.off('NEG-ERR', errListener)

      closed = true
      onClose?.()
    }

    this.target.on('NEG-MSG', msgListener)
    this.target.on('NEG-ERR', errListener)

    neg.initiate().then((msg: string) => {
      this.target.send("NEG-OPEN", id, filter, msg)
    })

    return {
      unsubscribe: close,
    }
  }
}
