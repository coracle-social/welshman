import {Emitter} from '@coracle.social/lib'
import type {Filter} from '@coracle.social/util'
import {matchFilters, hasValidSignature} from '@coracle.social/util'
import type {Event} from 'nostr-tools'
import type {Executor} from "./Executor"
import type {Connection} from './Connection'

export type SubscriptionOpts = {
  executor: Executor
  filters: Filter[]
  timeout?: number
  closeOnEose?: boolean
  hasSeen?: (e: Event, url: string) => boolean
  shouldValidate?: (e: Event, url: string) => boolean
}

export class Subscription extends Emitter {
  unsubscribe: () => void
  dead = new Set<string>()
  seen = new Set<string>()
  eose = new Set<string>()
  closeHandlers = new Map()
  opened = Date.now()
  closed?: number

  constructor(readonly opts: SubscriptionOpts) {
    super()

    const {executor, timeout, filters} = this.opts

    // If we have a timeout, close the subscription automatically
    if (timeout) {
      setTimeout(this.close, timeout)
    }

    // If one of our connections gets closed make sure to kill our sub
    executor.target.connections.forEach(con => {
      const handler = () => {
        this.dead.add(con.url)

        if (this.dead.size === executor.target.connections.length) {
          this.close()
        }
      }

      this.closeHandlers.set(con.url, handler)

      con.on("close", handler)
    })

    // Start our subscription
    const sub = executor.subscribe(filters, {
      onEvent: this.onEvent,
      onEose: this.onEose,
    })

    this.unsubscribe = sub.unsubscribe
  }

  hasSeen = (event: Event, url: string) => {
    if (this.opts.hasSeen) {
      return this.opts.hasSeen(event, url)
    }

    if (this.seen.has(event.id)) {
      return true
    }

    this.seen.add(event.id)

    return false
  }

  hasValidSignature = (event: Event, url: string) => {
    if (this.opts.shouldValidate && !this.opts.shouldValidate(event, url)) {
      return true
    }

    return hasValidSignature(event)
  }

  onEvent = (url: string, event: Event) => {
    // If we've seen this event, don't re-validate
    // Otherwise, check the signature and filters
    if (this.hasSeen(event, url)) {
      this.emit("duplicate", event, url)
    } else {
      if (!this.hasValidSignature(event, url)) {
        this.emit("invalid-signature", event, url)
      } else if (!matchFilters(this.opts.filters, event)) {
        this.emit("failed-filter", event, url)
      } else {
        this.emit("event", event, url)
      }
    }
  }

  onEose = (url: string) => {
    const {executor, closeOnEose} = this.opts

    this.emit("eose", url)

    this.eose.add(url)

    if (closeOnEose && this.eose.size >= executor.target.connections.length) {
      this.close()
    }
  }

  close = () => {
    if (!this.closed) {
      const {target} = this.opts.executor

      this.closed = Date.now()
      this.unsubscribe()
      this.emit("close")
      this.removeAllListeners()

      target.connections.forEach((con: Connection) => con.off("close", this.closeHandlers.get(con.url)))
      target.cleanup()
    }
  }
}
