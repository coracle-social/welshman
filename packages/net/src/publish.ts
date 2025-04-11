import {EventEmitter} from "events"
import {on, fromPairs, sleep, yieldThread} from "@welshman/lib"
import {SignedEvent} from "@welshman/util"
import {RelayMessage, ClientMessageType, isRelayOk} from "./message.js"
import {AbstractAdapter, AdapterEvent, AdapterContext, getAdapter} from "./adapter.js"

export enum PublishStatus {
  Pending = "publish:status:pending",
  Success = "publish:status:success",
  Failure = "publish:status:failure",
  Timeout = "publish:status:timeout",
  Aborted = "publish:status:aborted",
}

export type PublishResult = {
  status: PublishStatus
  detail: string
}

export type PublishOneOptions = {
  event: SignedEvent
  relay: string
  signal?: AbortSignal
  timeout?: number
  context?: AdapterContext
  onStatus?: (status: PublishStatus, relay: string) => void
  onSuccess?: (detail: string, relay: string) => void
  onFailure?: (detail: string, relay: string) => void
  onTimeout?: (relay: string) => void
  onAborted?: (relay: string) => void
  onComplete?: () => void
}

export const publishOne = (options: PublishOneOptions) =>
  new Promise(resolve => {
    const adapter = getAdapter(options.relay, options.context)

    let status = PublishStatus.Pending

    const setStatus = (_status: PublishStatus) => {
      status = _status
      options.onStatus?.(status, options.relay)
    }

    const cleanup = () => {
      options.onComplete?.()
      adapter.cleanup()
      resolve(status)
    }

    adapter.on(
      AdapterEvent.Receive,
      (message: RelayMessage, url: string) => {
        if (isRelayOk(message)) {
          const [_, id, ok, detail] = message

          if (id !== options.event.id) return

          if (ok) {
            setStatus(PublishStatus.Success)
            options.onSuccess?.(detail, options.relay)
          } else {
            setStatus(PublishStatus.Failure)
            options.onFailure?.(detail, options.relay)
          }

          cleanup()
        }
      },
    )

    options.signal?.addEventListener('abort', () => {
      if (status === PublishStatus.Pending) {
        setStatus(PublishStatus.Aborted)
        options.onAborted?.(options.relay)
      }

      cleanup()
    })

    setTimeout(() => {
      if (status === PublishStatus.Pending) {
        setStatus(PublishStatus.Timeout)
        options.onTimeout?.(options.relay)
      }

      cleanup()
    }, options.timeout || 10_000)

    adapter.send([ClientMessageType.Event, options.event])

    setStatus(PublishStatus.Pending)
  })

export type PublishStatusByRelay = Record<string, PublishStatus>

export type PublishOptions = Omit<PublishOneOptions, "relay"> & {
  relays: string[]
  onUpdate?: (status: PublishStatusByRelay) => void
}

export const publish = async (options: PublishOptions) => {
  const status: PublishStatusByRelay = {}
  const completed = new Set<string>()
  const relays = new Set(options.relays)

  if (relays.size !== options.relays.length) {
    console.warn("Non-unique relays passed to publish")
  }

  await Promise.all(
    options.relays.map(relay =>
      publishOne({
        relay,
        ...options,
        onStatus: (_status: PublishStatus, relay: string) => {
          status[relay] = _status
          options.onStatus?.(_status, relay)
          options.onUpdate?.(status)
        },
        onComplete: () => {
          completed.add(relay)

          if (completed.size === relays.size) {
            options.onComplete?.()
          }
        },
      })
    )
  )

  return status
}
