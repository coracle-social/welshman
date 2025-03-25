import {EventEmitter} from "events"
import {on, sleep, yieldThread} from "@welshman/lib"
import {SignedEvent} from "@welshman/util"
import {RelayMessage, ClientMessageType, isRelayOk} from "./message.js"
import {AbstractAdapter, AdapterEventType, AdapterContext, getAdapter} from "./adapter.js"
import {TypedEmitter} from "./util.js"

export enum PublicationStatus {
  Pending = "publication:status:pending",
  Success = "publication:status:success",
  Failure = "publication:status:failure",
  Timeout = "publication:status:timeout",
  Aborted = "publication:status:aborted",
}

export enum PublicationEventType {
  Success = "publication:event:success",
  Failure = "publication:event:failure",
  Timeout = "publication:event:timeout",
  Aborted = "publication:event:aborted",
  Complete = "publication:event:complete",
}

export type PublicationEvents = {
  [PublicationEventType.Success]: (id: string, detail: string, url: string) => void
  [PublicationEventType.Failure]: (id: string, detail: string, url: string) => void
  [PublicationEventType.Timeout]: () => void
  [PublicationEventType.Aborted]: () => void
  [PublicationEventType.Complete]: () => void
}

export type PublicationOptions = {
  relay: string
  event: SignedEvent
  context: AdapterContext
  timeout?: number
}

export class Publication extends (EventEmitter as new () => TypedEmitter<PublicationEvents>) {
  status = PublicationStatus.Pending

  _done = new Set<string>()
  _unsubscriber: () => void
  _adapter: AbstractAdapter

  constructor(readonly options: PublicationOptions) {
    super()

    // Set up our adapter
    this._adapter = getAdapter(this.options.relay, this.options.context)

    // Listen for Publication result
    this._unsubscriber = on(
      this._adapter,
      AdapterEventType.Receive,
      (message: RelayMessage, url: string) => {
        if (isRelayOk(message)) {
          const [_, id, ok, detail] = message

          if (id !== this.options.event.id) return

          if (ok) {
            this.status = PublicationStatus.Success
            this.emit(PublicationEventType.Success, id, detail, url)
          } else {
            this.status = PublicationStatus.Failure
            this.emit(PublicationEventType.Failure, id, detail, url)
          }

          this.cleanup()
        }
      },
    )

    // Autostart asynchronously so the caller can set up listeners
    yieldThread().then(this.start)
  }

  start = () => {
    // Set timeout
    sleep(this.options.timeout || 10_000).then(() => {
      if (this.status === PublicationStatus.Pending) {
        this.status = PublicationStatus.Timeout
        this.emit(PublicationEventType.Timeout)
      }

      this.cleanup()
    })

    // Send the Publication message
    this._adapter.send([ClientMessageType.Event, event])
  }

  abort = () => {
    if (this.status === PublicationStatus.Pending) {
      this.status = PublicationStatus.Aborted
      this.emit(PublicationEventType.Aborted)
      this.cleanup()
    }
  }

  cleanup = () => {
    this.emit(PublicationEventType.Complete)
    this.removeAllListeners()
    this._adapter.cleanup()
    this._unsubscriber()
  }
}

export const publish = (options: PublicationOptions) => new Publication(options)
