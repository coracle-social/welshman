import type {Event} from 'nostr-tools'
import {Emitter, now, randomId, defer} from '@coracle.social/lib'
import type {Deferred} from '@coracle.social/lib'
import {asEvent,} from '@coracle.social/util'
import {Tracker} from "./Tracker"
import {NetworkContext} from './Context'

export enum PublishStatus {
  Pending = "pending",
  Success = "success",
  Failure = "failure",
  Timeout = "timeout",
}

export type PublishStatusMap = Map<string, PublishStatus>

export type PublishRequest = {
  event: Event
  relays: string[]
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
  const result: Publish['result'] = defer()
  const status: Publish['status'] = new Map()

  return {id, created_at, request, emitter, result, status}
}

export const publish = (request: PublishRequest) => {
  const pub = makePublish(request)
  const event = asEvent(request.event)
  const executor = NetworkContext.getExecutor(request.relays)

  // Listen to updates and keep status up to date. Every time there's an update, check to
  // see if we're done. If we are, clear our timeout, executor, etc.
  pub.emitter.on("*", (status: PublishStatus, url: string) => {
    pub.status.set(url, status)

    if (Array.from(pub.status.values()).every((s: PublishStatus) => s !== PublishStatus.Pending)) {
      clearTimeout(timeout)
      executorSub.unsubscribe()
      executor.target.cleanup()
      pub.result.resolve(pub.status)
    }
  })

  // Start everything off as pending
  requestAnimationFrame(() => {
    for (const relay of request.relays) {
      pub.emitter.emit(PublishStatus.Pending, relay)
    }
  })

  // Set a timeout
  const timeout = setTimeout(() => {
    for (const [url, status] of pub.status.entries()) {
      if (status === PublishStatus.Pending) {
        pub.emitter.emit(PublishStatus.Timeout, url)
      }
    }
  }, request.timeout || 10_000)

  // Delegate to our executor
  const executorSub = executor.publish(event, {
    verb: request.verb || "EVENT",
    onOk: (url: string, eventId: string, ok: boolean) => {
      if (ok) {
        pub.emitter.emit(PublishStatus.Success, url)
      } else {
        pub.emitter.emit(PublishStatus.Failure, url)
      }
    },
    onError: (url: string) => {
      pub.emitter.emit(PublishStatus.Failure, url)
    },
  })

  return pub
}

