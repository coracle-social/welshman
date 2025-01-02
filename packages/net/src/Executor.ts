import {ctx, noop} from "@welshman/lib"
import type {Emitter} from "@welshman/lib"
import type {SignedEvent, TrustedEvent, Filter} from "@welshman/util"
import type {Message} from "./Socket.js"
import type {Connection} from "./Connection.js"
import {Negentropy, NegentropyStorageVector} from "./Negentropy.js"

export type Target = Emitter & {
  connections: Connection[]
  send: (...args: Message) => Promise<void>
  cleanup: () => void
}

export type NegentropyMessage = {
  have: string[]
  need: string[]
}

type EventCallback = (url: string, event: TrustedEvent) => void
type EoseCallback = (url: string) => void
type CloseCallback = () => void
type OkCallback = (url: string, id: string, ...extra: any[]) => void
type ErrorCallback = (url: string, id: string, ...extra: any[]) => void
type DiffMessage = {have: string[]; need: string[]}
type DiffMessageCallback = (url: string, {have, need}: DiffMessage) => void
type SubscribeOpts = {onEvent?: EventCallback; onEose?: EoseCallback}
type PublishOpts = {verb?: string; onOk?: OkCallback; onError?: ErrorCallback}
type DiffOpts = {onError?: ErrorCallback; onMessage?: DiffMessageCallback; onClose?: CloseCallback}

const createSubId = (prefix: string) => `${prefix}-${Math.random().toString().slice(2, 10)}`

export class Executor {
  constructor(readonly target: Target) {}

  subscribe(filters: Filter[], {onEvent, onEose}: SubscribeOpts = {}) {
    let closed = false

    const id = createSubId("REQ")

    const eventListener = (url: string, subid: string, e: TrustedEvent) => {
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

    this.target.on("EVENT", eventListener)
    this.target.on("EOSE", eoseListener)
    this.target.send("REQ", id, ...filters)

    return {
      unsubscribe: () => {
        if (closed) return

        this.target.send("CLOSE", id).catch(noop)
        this.target.off("EVENT", eventListener)
        this.target.off("EOSE", eoseListener)

        closed = true
      },
    }
  }

  publish(event: SignedEvent, {verb = "EVENT", onOk, onError}: PublishOpts = {}) {
    const okListener = (url: string, id: string, ok: boolean, message: string) => {
      if (id === event.id) {
        if (ok) {
          ctx.net.onEvent(url, event)
        }

        onOk?.(url, id, ok, message)
      }
    }

    const errorListener = (url: string, id: string, ...payload: any[]) => {
      if (id === event.id) {
        onError?.(url, id, ...payload)
      }
    }

    this.target.on("OK", okListener)
    this.target.on("ERROR", errorListener)
    this.target.send(verb, event)

    return {
      unsubscribe: () => {
        this.target.off("OK", okListener)
        this.target.off("ERROR", errorListener)
      },
    }
  }

  diff(filter: Filter, events: TrustedEvent[], {onMessage, onError, onClose}: DiffOpts = {}) {
    let closed = false

    const id = createSubId("NEG")
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
          this.target.send("NEG-MSG", id, newMsg)
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

      this.target.send("NEG-CLOSE", id).catch(noop)
      this.target.off("NEG-MSG", msgListener)
      this.target.off("NEG-ERR", errListener)

      closed = true
      onClose?.()
    }

    this.target.on("NEG-MSG", msgListener)
    this.target.on("NEG-ERR", errListener)

    neg.initiate().then((msg: string) => {
      this.target.send("NEG-OPEN", id, filter, msg)
    })

    return {
      unsubscribe: close,
    }
  }
}
