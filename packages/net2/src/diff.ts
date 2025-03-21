import {EventEmitter} from "events"
import {on, randomId} from "@welshman/lib"
import {SignedEvent, Filter} from "@welshman/util"
import {RelayMessage, isRelayNegErrMessage, isRelayNegMsgMessage} from "./message.js"
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

export class Diff extends (EventEmitter as new () => TypedEmitter<DiffEvents>) {
  _id = `NEG-${randomId().slice(0, 8)}`
  _unsubscriber: () => void
  _closed = false

  constructor(
    readonly adapter: AbstractAdapter,
    readonly events: SignedEvent[],
    readonly filter: Filter,
  ) {
    super()

    const storage = new NegentropyStorageVector()
    const neg = new Negentropy(storage, 50_000)

    for (const event of events) {
      storage.insert(event.created_at, event.id)
    }

    storage.seal()

    this._unsubscriber = on(
      adapter,
      AdapterEventType.Receive,
      async (message: RelayMessage, url: string) => {
        if (isRelayNegMsgMessage(message)) {
          const [_, negid, msg] = message

          if (negid === this._id) {
            const [newMsg, have, need] = await neg.reconcile(msg)

            this.emit(DiffEventType.Message, {have, need}, url)

            if (newMsg) {
              adapter.send(["NEG-MSG", this._id, newMsg])
            } else {
              this.close()
            }
          }
        }

        if (isRelayNegErrMessage(message)) {
          const [_, negid, msg] = message

          if (negid === this._id) {
            this.emit(DiffEventType.Error, msg, url)
          }
        }
      },
    )

    neg.initiate().then((msg: string) => {
      adapter.send(["NEG-OPEN", this._id, filter, msg])
    })
  }

  close() {
    if (this._closed) return

    this.adapter.send(["NEG-CLOSE", this._id])
    this.emit(DiffEventType.Close)
    this._unsubscriber()

    this._closed = true
  }
}
