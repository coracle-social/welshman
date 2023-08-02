import {EventEmitter} from 'events'

const createSubId = prefix => [prefix, Math.random().toString().slice(2, 10)].join('-')

export class Executor {
  target: EventEmitter
  constructor(target) {
    this.target = target
  }
  subscribe(filters, {onEvent, onEose}) {
    let closed = false

    const id = createSubId('REQ')
    const eventListener = (url, subid, e) => subid === id && onEvent?.(url, e)
    const eoseListener = (url, subid) => subid === id && onEose?.(url)

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
  publish(event, {verb = 'EVENT', onOk, onError} = {}) {
    const okListener = (url, id, ...payload) => id === event.id && onOk(url, id, ...payload)
    const errorListener = (url, id, ...payload) => id === event.id && onError(url, id, ...payload)

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
  count(filters, {onCount}) {
    const id = createSubId('COUNT')
    const countListener = (url, subid, ...payload) => {
      if (subid === id) {
        onCount(url, ...payload)
        this.target.off('COUNT', countListener)
      }
    }

    this.target.on('COUNT', countListener)
    this.target.send("COUNT", id, ...filters)

    return {
      unsubscribe: () => this.target.off('COUNT', countListener)
    }
  }
  handleAuth({onAuth, onOk}) {
    this.target.on('AUTH', onAuth)
    this.target.on('OK', onOk)

    return {
      unsubscribe: () => {
        this.target.off('AUTH', onAuth)
        this.target.off('OK', onOk)
      }
    }
  }
}
