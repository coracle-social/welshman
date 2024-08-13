import type {Emitter} from '@welshman/lib'
import type {SignedEvent, Filter} from '@welshman/util'
import type {Message} from './Socket'
import type {Connection} from './Connection'
import {NetworkContext} from './Context'

export type Target = Emitter & {
  connections: Connection[]
  send: (...args: Message) => void
  cleanup: () => void
}

type EventCallback = (url: string, event: SignedEvent) => void
type EoseCallback = (url: string) => void
type OkCallback = (url: string, id: string, ...extra: any[]) => void
type ErrorCallback = (url: string, id: string, ...extra: any[]) => void
type SubscribeOpts = {onEvent?: EventCallback, onEose?: EoseCallback}
type PublishOpts = {verb?: string, onOk?: OkCallback, onError?: ErrorCallback}

const createSubId = (prefix: string) => [prefix, Math.random().toString().slice(2, 10)].join('-')

export class Executor {

  constructor(readonly target: Target) {
    target.on('AUTH', NetworkContext.onAuth)
    target.on('OK', NetworkContext.onOk)
  }

  subscribe(filters: Filter[], {onEvent, onEose}: SubscribeOpts = {}) {
    let closed = false

    const id = createSubId('REQ')

    const eventListener = (url: string, subid: string, e: SignedEvent) => {
      if (subid === id) {
        NetworkContext.onEvent(url, e)
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
        if (!closed) {
          this.target.send("CLOSE", id)
          this.target.off('EVENT', eventListener)
          this.target.off('EOSE', eoseListener)
        }

        closed = true
      },
    }
  }

  publish(event: SignedEvent, {verb = 'EVENT', onOk, onError}: PublishOpts = {}) {
    const okListener = (url: string, id: string, ...payload: any[]) => {
      if (id === event.id) {
        NetworkContext.onEvent(url, event)
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
}

