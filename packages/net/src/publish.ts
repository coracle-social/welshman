import {EventEmitter} from "events"
import {on, fromPairs, sleep, yieldThread} from "@welshman/lib"
import {SignedEvent} from "@welshman/util"
import {RelayMessage, ClientMessageType, isRelayOk} from "./message.js"
import {AbstractAdapter, AdapterEvent, AdapterContext, getAdapter} from "./adapter.js"

export enum PublishStatus {
  Sending = "publish:status:sending",
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
  onSuccess?: (detail: string) => void
  onFailure?: (detail: string) => void
  onPending?: () => void
  onTimeout?: () => void
  onAborted?: () => void
  onComplete?: () => void
}

export const publishOne = (options: PublishOneOptions) =>
  new Promise(resolve => {
    const adapter = getAdapter(options.relay, options.context)

    let status = PublishStatus.Pending

    options.onPending?.()

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
            status = PublishStatus.Success
            options.onSuccess?.(detail)
          } else {
            status = PublishStatus.Failure
            options.onFailure?.(detail)
          }

          cleanup()
        }
      },
    )

    options.signal?.addEventListener('abort', () => {
      if (status === PublishStatus.Pending) {
        status = PublishStatus.Aborted
        options.onAborted?.()
      }

      cleanup()
    })

    setTimeout(() => {
      if (status === PublishStatus.Pending) {
        status = PublishStatus.Timeout
        options.onTimeout?.()
      }

      cleanup()
    }, options.timeout || 10_000)

    adapter.send([ClientMessageType.Event, options.event])
  })

export type PublishStatusByRelay = Record<string, PublishStatus>

export type PublishOptions = {
  event: SignedEvent
  relays: string[]
  signal?: AbortSignal
  timeout?: number
  context?: AdapterContext
  onSuccess?: (detail: string, relay: string) => void
  onFailure?: (detail: string, relay: string) => void
  onPending?: (relay: string) => void
  onTimeout?: (relay: string) => void
  onAborted?: (relay: string) => void
  onComplete?: () => void
}

export const publish = async (options: PublishOptions) => {
  const {event, timeout, signal, context} = options
  const status: PublishStatusByRelay = {}
  const completed = new Set<string>()
  const relays = new Set(options.relays)

  if (relays.size !== options.relays.length) {
    console.warn("Non-unique relays passed to publish")
  }

  await Promise.all(
    options.relays.map(relay =>
      publishOne({
        event,
        relay,
        signal,
        timeout,
        context,
        onSuccess: (detail: string) => {
          status[relay] = PublishStatus.Success
          options.onSuccess?.(detail, relay)
        },
        onFailure: (detail: string) => {
          status[relay] = PublishStatus.Failure
          options.onFailure?.(detail, relay)
        },
        onPending: () => {
          status[relay] = PublishStatus.Pending
          options.onPending?.(relay)
        },
        onTimeout: () => {
          status[relay] = PublishStatus.Timeout
          options.onTimeout?.(relay)
        },
        onAborted: () => {
          status[relay] = PublishStatus.Aborted
          options.onAborted?.(relay)
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
