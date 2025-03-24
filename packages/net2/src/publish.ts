import {EventEmitter} from "events"
import {on, sleep, yieldThread} from "@welshman/lib"
import {SignedEvent} from "@welshman/util"
import {RelayMessage, ClientMessageType, isRelayOk} from "./message.js"
import {AbstractAdapter, AdapterEventType, AdapterContext, getAdapter} from "./adapter.js"
import {TypedEmitter} from "./util.js"

export enum PublishStatus {
  Pending = "publish:status:pending",
  Success = "publish:status:success",
  Failure = "publish:status:failure",
  Timeout = "publish:status:timeout",
  Aborted = "publish:status:aborted",
}

export enum PublishEventType {
  Complete = "publish:status:complete",
}

export type PublishEvents = {
  [PublishStatus.Success]: (id: string, detail: string, url: string) => void
  [PublishStatus.Failure]: (id: string, detail: string, url: string) => void
  [PublishStatus.Timeout]: () => void
  [PublishStatus.Aborted]: () => void
  [PublishEventType.Complete]: () => void
}

export type PublishOptions = {
  relay: string
  event: SignedEvent
  context: AdapterContext
  timeout?: number
  on?: Partial<PublishEvents>
}

export class Publish extends (EventEmitter as new () => TypedEmitter<PublishEvents>) {
  status = PublishStatus.Pending

  _done = new Set<string>()
  _unsubscriber: () => void
  _adapter: AbstractAdapter

  constructor(readonly options: PublishOptions) {
    super()

    // Set up our adapter
    this._adapter = getAdapter(this.options.relay, this.options.context)

    // Listen for publish result
    this._unsubscriber = on(
      this._adapter,
      AdapterEventType.Receive,
      (message: RelayMessage, url: string) => {
        if (isRelayOk(message)) {
          const [_, id, ok, detail] = message

          if (id !== this.options.event.id) return

          if (ok) {
            this.status = PublishStatus.Success
            this.emit(PublishStatus.Success, id, detail, url)
          } else {
            this.status = PublishStatus.Failure
            this.emit(PublishStatus.Failure, id, detail, url)
          }

          this.cleanup()
        }
      },
    )

    // Register handlers
    if (this.options.on) {
      for (const [k, listener] of Object.entries(this.options.on)) {
        this.on(k as keyof PublishEvents, listener)
      }
    }

    // Autostart asynchronously so the caller can set up listeners
    yieldThread().then(this.start)
  }

  start = () => {
    // Set timeout
    sleep(this.options.timeout || 10_000).then(() => {
      if (this.status === PublishStatus.Pending) {
        this.status = PublishStatus.Timeout
        this.emit(PublishStatus.Timeout)
      }

      this.cleanup()
    })

    // Send the publish message
    this._adapter.send([ClientMessageType.Event, event])
  }

  abort = () => {
    if (this.status === PublishStatus.Pending) {
      this.status = PublishStatus.Aborted
      this.emit(PublishStatus.Aborted)
      this.cleanup()
    }
  }

  cleanup = () => {
    this.emit(PublishEventType.Complete)
    this.removeAllListeners()
    this._adapter.cleanup()
    this._unsubscriber()
  }
}

export const publish = (options: PublishOptions) => new Publish(options)
