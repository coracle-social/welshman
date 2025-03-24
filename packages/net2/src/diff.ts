import {EventEmitter} from "events"
import {on, randomId} from "@welshman/lib"
import {SignedEvent, Filter} from "@welshman/util"
import {
  RelayMessage,
  isRelayNegErr,
  isRelayNegMsg,
  RelayMessageType,
  ClientMessageType,
} from "./message.js"
import {AbstractAdapter, AdapterEventType} from "./adapter.js"
import {Negentropy, NegentropyStorageVector} from "./negentropy.js"
import {TypedEmitter} from "./util.js"

export enum DiffEventType {
  Message = "diff:event:message",
  Error = "diff:event:error",
  Close = "diff:event:close",
}

export type DiffEvents = {
  [DiffEventType.Message]: (payload: {have: string[]; need: string[]}, url: string) => void
  [DiffEventType.Error]: (error: string, url: string) => void
  [DiffEventType.Close]: () => void
}

export type DiffOptions = {
  filter: Filter
  events: SignedEvent[]
  adapter: AbstractAdapter
  on?: Partial<DiffEvents>
}

export class Diff extends (EventEmitter as new () => TypedEmitter<DiffEvents>) {
  _id = `NEG-${randomId().slice(0, 8)}`
  _unsubscriber: () => void
  _closed = false

  constructor(readonly options: DiffOptions) {
    super()

    const storage = new NegentropyStorageVector()
    const neg = new Negentropy(storage, 50_000)

    for (const event of this.options.events) {
      storage.insert(event.created_at, event.id)
    }

    storage.seal()

    this._unsubscriber = on(
      this.options.adapter,
      AdapterEventType.Receive,
      async (message: RelayMessage, url: string) => {
        if (isRelayNegMsg(message)) {
          const [_, negid, msg] = message

          if (negid === this._id) {
            const [newMsg, have, need] = await neg.reconcile(msg)

            this.emit(DiffEventType.Message, {have, need}, url)

            if (newMsg) {
              this.options.adapter.send([RelayMessageType.NegMsg, this._id, newMsg])
            } else {
              this.close()
            }
          }
        }

        if (isRelayNegErr(message)) {
          const [_, negid, msg] = message

          if (negid === this._id) {
            this.emit(DiffEventType.Error, msg, url)
          }
        }
      },
    )

    // Register listeners
    if (this.options.on) {
      for (const [k, listener] of Object.entries(this.options.on)) {
        this.on(k as keyof DiffEvents, listener)
      }
    }

    neg.initiate().then((msg: string) => {
      this.options.adapter.send([ClientMessageType.NegOpen, this._id, this.options.filter, msg])
    })
  }

  close() {
    if (this._closed) return

    this.options.adapter.send([ClientMessageType.NegClose, this._id])
    this.emit(DiffEventType.Close)
    this.removeAllListeners()
    this._unsubscriber()
    this._closed = true
  }
}
