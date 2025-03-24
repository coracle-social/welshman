import {EventEmitter} from "events"
import {on, sleep, yieldThread} from "@welshman/lib"
import {SignedEvent} from "@welshman/util"
import {RelayMessage, ClientMessageType, isRelayOk} from "./message.js"
import {AbstractAdapter, AdapterEventType} from "./adapter.js"
import {TypedEmitter} from "./util.js"

export enum PublishStatus {
  Pending = "publish:status:pending",
  Success = "publish:status:success",
  Failure = "publish:status:failure",
  Timeout = "publish:status:timeout",
  Aborted = "publish:status:aborted",
}

export type PublishEvents = {
  [PublishStatus.Pending]: (url: string) => void
  [PublishStatus.Success]: (id: string, detail: string, url: string) => void
  [PublishStatus.Failure]: (id: string, detail: string, url: string) => void
  [PublishStatus.Timeout]: (url: string) => void
  [PublishStatus.Aborted]: (url: string) => void
}

export type PublishOptions = {
  adapter: AbstractAdapter
  event: SignedEvent
  timeout?: number
  on?: Partial<PublishEvents>
}

export class Publish extends (EventEmitter as new () => TypedEmitter<PublishEvents>) {
  status = new Map<string, PublishStatus>()

  _done = new Set<string>()
  _unsubscriber: () => void

  constructor(readonly options: PublishOptions) {
    super()

    // Listen for publish result
    this._unsubscriber = on(
      this.options.adapter,
      AdapterEventType.Receive,
      (message: RelayMessage, url: string) => {
        if (isRelayOk(message)) {
          const [_, id, ok, detail] = message

          if (id !== this.options.event.id) return

          if (ok) {
            this.status.set(url, PublishStatus.Success)
            this.emit(PublishStatus.Success, id, detail, url)
          } else {
            this.status.set(url, PublishStatus.Failure)
            this.emit(PublishStatus.Failure, id, detail, url)
          }

          if (!Array.from(this.status.values()).includes(PublishStatus.Pending)) {
            this.cleanup()
          }
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
    // Initialize status
    for (const url of this.options.adapter.urls) {
      this.status.set(url, PublishStatus.Pending)
      this.emit(PublishStatus.Pending, url)
    }

    // Set timeout
    sleep(this.options.timeout || 10_000).then(() => {
      for (const [url, status] of this.status.entries()) {
        if (status === PublishStatus.Pending) {
          this.status.set(url, PublishStatus.Timeout)
          this.emit(PublishStatus.Timeout, url)
        }
      }

      this.cleanup()
    })

    // Send the publish message
    this.options.adapter.send([ClientMessageType.Event, event])
  }

  abort = () => {
    for (const [url, status] of this.status.entries()) {
      if (status === PublishStatus.Pending) {
        this.status.set(url, PublishStatus.Aborted)
        this.emit(PublishStatus.Aborted, url)
      }
    }

    this.cleanup()
  }

  cleanup = () => {
    this.options.adapter.cleanup()
    this.removeAllListeners()
    this._unsubscriber()
  }
}
