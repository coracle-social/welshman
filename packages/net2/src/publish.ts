import {EventEmitter} from "events"
import {on} from "@welshman/lib"
import {SignedEvent} from "@welshman/util"
import {RelayMessage, isRelayOkMessage} from "./message.js"
import {AbstractAdapter, AdapterEventType} from "./adapter.js"
import {TypedEmitter} from "./util.js"

export enum PublishEventType {
  Ok = "publish:event:ok",
}

export type PublishEvents = {
  [PublishEventType.Ok]: (id: string, ok: boolean, detail: string, url: string) => void
}

export class Publish extends (EventEmitter as new () => TypedEmitter<PublishEvents>) {
  _unsubscriber: () => void

  constructor(
    readonly adapter: AbstractAdapter,
    readonly event: SignedEvent,
    readonly verb = "EVENT",
  ) {
    super()

    this._unsubscriber = on(
      adapter,
      AdapterEventType.Receive,
      (message: RelayMessage, url: string) => {
        if (isRelayOkMessage(message)) {
          const [_, id, ok, detail] = message

          if (id === event.id) {
            this.emit(PublishEventType.Ok, id, ok, detail, url)
          }
        }
      },
    )

    adapter.send([verb, event])
  }

  close() {
    this._unsubscriber()
  }
}
