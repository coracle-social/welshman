import {EventEmitter} from "events"
import {on, fromPairs, sleep, yieldThread} from "@welshman/lib"
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
  Success = "publish:event:success",
  Failure = "publish:event:failure",
  Timeout = "publish:event:timeout",
  Aborted = "publish:event:aborted",
  Complete = "publish:event:complete",
}

// Unicast

export type UnicastEvents = {
  [PublishEventType.Success]: (id: string, detail: string) => void
  [PublishEventType.Failure]: (id: string, detail: string) => void
  [PublishEventType.Timeout]: () => void
  [PublishEventType.Aborted]: () => void
  [PublishEventType.Complete]: () => void
}

export type UnicastOptions = {
  event: SignedEvent
  relay: string
  context: AdapterContext
  timeout?: number
}

export class Unicast extends (EventEmitter as new () => TypedEmitter<UnicastEvents>) {
  status = PublishStatus.Pending

  _unsubscriber: () => void
  _adapter: AbstractAdapter

  constructor(readonly options: UnicastOptions) {
    super()

    // Set up our adapter
    this._adapter = getAdapter(this.options.relay, this.options.context)

    // Listen for Unicast result
    this._unsubscriber = on(
      this._adapter,
      AdapterEventType.Receive,
      (message: RelayMessage, url: string) => {
        if (isRelayOk(message)) {
          const [_, id, ok, detail] = message

          if (id !== this.options.event.id) return

          if (ok) {
            this.status = PublishStatus.Success
            this.emit(PublishEventType.Success, id, detail)
          } else {
            this.status = PublishStatus.Failure
            this.emit(PublishEventType.Failure, id, detail)
          }

          this.cleanup()
        }
      },
    )

    // Set timeout
    sleep(this.options.timeout || 10_000).then(() => {
      if (this.status === PublishStatus.Pending) {
        this.status = PublishStatus.Timeout
        this.emit(PublishEventType.Timeout)
      }

      this.cleanup()
    })

    // Start asynchronously so the caller can set up listeners
    yieldThread().then(() => {
      this._adapter.send([ClientMessageType.Event, this.options.event])
    })
  }

  abort = () => {
    if (this.status === PublishStatus.Pending) {
      this.status = PublishStatus.Aborted
      this.emit(PublishEventType.Aborted)
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

// Multicast

export type MulticastEvents = {
  [PublishEventType.Success]: (id: string, detail: string, url: string) => void
  [PublishEventType.Failure]: (id: string, detail: string, url: string) => void
  [PublishEventType.Timeout]: (url: string) => void
  [PublishEventType.Aborted]: (url: string) => void
  [PublishEventType.Complete]: () => void
}

export type MulticastOptions = Omit<UnicastOptions, "relay"> & {
  relays: string[]
}

export class Multicast extends (EventEmitter as new () => TypedEmitter<MulticastEvents>) {
  status: Record<string, PublishStatus>

  _children: Unicast[] = []
  _completed = new Set<string>()

  constructor({relays, ...options}: MulticastOptions) {
    super()

    this.status = fromPairs(relays.map(relay => [relay, PublishStatus.Pending]))

    for (const relay of relays) {
      const unicast = new Unicast({relay, ...options})

      unicast.on(PublishEventType.Success, (id: string, detail: string) => {
        this.status[relay] = unicast.status
        this.emit(PublishEventType.Success, id, detail, relay)
      })

      unicast.on(PublishEventType.Failure, (id: string, detail: string) => {
        this.status[relay] = unicast.status
        this.emit(PublishEventType.Failure, id, detail, relay)
      })

      unicast.on(PublishEventType.Timeout, () => {
        this.status[relay] = unicast.status
        this.emit(PublishEventType.Timeout, relay)
      })

      unicast.on(PublishEventType.Aborted, () => {
        this.status[relay] = unicast.status
        this.emit(PublishEventType.Aborted, relay)
      })

      unicast.on(PublishEventType.Complete, () => {
        this._completed.add(relay)
        this.status[relay] = unicast.status

        if (this._completed.size === relays.length) {
          this.emit(PublishEventType.Complete)
          this.cleanup()
        }
      })

      this._children.push(unicast)
    }
  }

  abort() {
    for (const child of this._children) {
      child.abort()
    }
  }

  cleanup() {
    this.removeAllListeners()
  }
}

// Convenience functions

export const unicast = (options: UnicastOptions) => new Unicast(options)

export const multicast = (options: MulticastOptions) => new Multicast(options)
