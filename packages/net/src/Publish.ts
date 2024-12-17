import {ctx, Emitter, now, randomId, defer} from "@welshman/lib"
import type {Deferred} from "@welshman/lib"
import {asSignedEvent} from "@welshman/util"
import type {SignedEvent} from "@welshman/util"

export enum PublishStatus {
  Pending = "pending",
  Success = "success",
  Failure = "failure",
  Timeout = "timeout",
  Aborted = "aborted",
}

export type PublishStatusMap = Map<string, PublishStatus>

export type PublishRequest = {
  event: SignedEvent
  relays: string[]
  signal?: AbortSignal
  timeout?: number
  verb?: "EVENT" | "AUTH"
}

export type Publish = {
  id: string
  created_at: number
  emitter: Emitter
  request: PublishRequest
  status: PublishStatusMap
  result: Deferred<PublishStatusMap>
}

export const makePublish = (request: PublishRequest) => {
  const id = randomId()
  const created_at = now()
  const emitter = new Emitter()
  const result: Publish["result"] = defer()
  const status: Publish["status"] = new Map()

  return {id, created_at, request, emitter, result, status}
}

export const publish = (request: PublishRequest) => {
  const pub = makePublish(request)
  const event = asSignedEvent(request.event)
  const executor = ctx.net.getExecutor(request.relays)

  const abort = (reason: PublishStatus) => {
    for (const [url, status] of pub.status.entries()) {
      if (status === PublishStatus.Pending) {
        pub.emitter.emit(reason, url)
      }
    }
  }

  // Listen to updates and keep status up to date. Every time there's an update, check to
  // see if we're done. If we are, clean everything up
  pub.emitter.on("*", (status: PublishStatus, url: string) => {
    pub.status.set(url, status)

    if (Array.from(pub.status.values()).every((s: PublishStatus) => s !== PublishStatus.Pending)) {
      clearTimeout(timeout)
      executorSub.unsubscribe()
      executor.target.cleanup()
      pub.result.resolve(pub.status)
    }
  })

  // Start everything off as pending. Do it asynchronously to avoid breaking caller assumptions
  setTimeout(() => {
    for (const relay of request.relays) {
      pub.emitter.emit(PublishStatus.Pending, relay)
    }
  })

  // Give up after a specified time
  const timeout = setTimeout(() => abort(PublishStatus.Timeout), request.timeout || 10_000)

  // If we have a signal, use it
  request.signal?.addEventListener("abort", () => abort(PublishStatus.Aborted))

  // Delegate to our executor
  const executorSub = executor.publish(event, {
    verb: request.verb || "EVENT",
    onOk: (url: string, eventId: string, ok: boolean, message: string) => {
      if (ok) {
        pub.emitter.emit(PublishStatus.Success, url, message)
      } else {
        pub.emitter.emit(PublishStatus.Failure, url, message)
      }
    },
    onError: (url: string) => {
      pub.emitter.emit(PublishStatus.Failure, url)
    },
  })

  return pub
}
