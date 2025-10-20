import {fromPairs} from "@welshman/lib"
import {SignedEvent} from "@welshman/util"
import {RelayMessage, ClientMessageType, isRelayOk} from "./message.js"
import {AdapterEvent, AdapterContext, getAdapter} from "./adapter.js"

export enum PublishStatus {
  Sending = "sending",
  Pending = "pending",
  Success = "success",
  Failure = "failure",
  Timeout = "timeout",
  Aborted = "aborted",
}

export type PublishResult = {
  status: PublishStatus
  detail: string
  relay: string
}

export type PublishOneOptions = {
  event: SignedEvent
  relay: string
  signal?: AbortSignal
  timeout?: number
  context?: AdapterContext
  onSuccess?: (result: PublishResult) => void
  onFailure?: (result: PublishResult) => void
  onPending?: (result: PublishResult) => void
  onTimeout?: (result: PublishResult) => void
  onAborted?: (result: PublishResult) => void
  onComplete?: (result: PublishResult) => void
}

export const publishOne = (options: PublishOneOptions) =>
  new Promise<PublishResult>(resolve => {
    const adapter = getAdapter(options.relay, options.context)

    const result = {
      relay: options.relay,
      status: PublishStatus.Pending,
      detail: "",
    }

    options.onPending?.(result)

    const cleanup = () => {
      options.onComplete?.(result)
      adapter.cleanup()
      resolve(result)
    }

    adapter.on(AdapterEvent.Receive, (message: RelayMessage, url: string) => {
      if (isRelayOk(message)) {
        const [_, id, ok, detail] = message

        if (id !== options.event.id) return

        if (ok) {
          result.status = PublishStatus.Success
          result.detail = detail

          options.onSuccess?.(result)
        } else {
          result.status = PublishStatus.Failure
          result.detail = detail

          options.onFailure?.(result)
        }

        cleanup()
      }
    })

    options.signal?.addEventListener("abort", () => {
      if (result.status === PublishStatus.Pending) {
        result.status = PublishStatus.Aborted
        result.detail = "aborted"

        options.onAborted?.(result)
      }

      cleanup()
    })

    setTimeout(() => {
      if (result.status === PublishStatus.Pending) {
        result.status = PublishStatus.Timeout
        result.detail = "timed out"

        options.onTimeout?.(result)
      }

      cleanup()
    }, options.timeout || 10_000)

    adapter.send([ClientMessageType.Event, options.event])
  })

export type PublishResultsByRelay = Record<string, PublishResult>

export type PublishOptions = {
  event: SignedEvent
  relays: string[]
  signal?: AbortSignal
  timeout?: number
  context?: AdapterContext
  onSuccess?: (result: PublishResult) => void
  onFailure?: (result: PublishResult) => void
  onPending?: (result: PublishResult) => void
  onTimeout?: (result: PublishResult) => void
  onAborted?: (result: PublishResult) => void
  onComplete?: (result: PublishResult) => void
}

export const publish = async (options: PublishOptions): Promise<PublishResultsByRelay> => {
  const {event, timeout, signal, context} = options
  const completed = new Set<string>()
  const relays = new Set(options.relays)

  if (relays.size !== options.relays.length) {
    console.warn("Non-unique relays passed to publish")
  }

  return fromPairs(
    await Promise.all(
      options.relays.map(async relay => {
        const result = await publishOne({
          event,
          relay,
          signal,
          timeout,
          context,
          onSuccess: options.onSuccess,
          onFailure: options.onFailure,
          onPending: options.onPending,
          onTimeout: options.onTimeout,
          onAborted: options.onAborted,
          onComplete: (result: PublishResult) => {
            completed.add(relay)

            if (completed.size === relays.size) {
              options.onComplete?.(result)
            }
          },
        })

        return [relay, result]
      }),
    ),
  )
}
