import {Emitter, now} from "@welshman/lib"
import type {TrustedEvent, SignedEvent, Filter} from "@welshman/util"
import {subscribe, publish, SubscriptionEvent} from "@welshman/net"
import type {Subscription, Publish} from "@welshman/net"

export enum DVMEvent {
  Progress = "progress",
  Result = "result",
}

export type DVMRequestOptions = {
  event: SignedEvent
  relays: string[]
  timeout?: number
  autoClose?: boolean
  reportProgress?: boolean
}

export type DVMRequest = {
  request: DVMRequestOptions
  emitter: Emitter
  sub: Subscription
  pub: Publish
}

export const makeDvmRequest = (request: DVMRequestOptions) => {
  const emitter = new Emitter()
  const {event, relays, timeout = 30_000, autoClose = true, reportProgress = true} = request
  const kind = event.kind + 1000
  const kinds = reportProgress ? [kind, 7000] : [kind]
  const filters: Filter[] = [{kinds, since: now() - 60, "#e": [event.id]}]

  const sub = subscribe({relays, timeout, filters})
  const pub = publish({event, relays, timeout})

  sub.on(SubscriptionEvent.Event, (url: string, event: TrustedEvent) => {
    if (event.kind === 7000) {
      emitter.emit(DVMEvent.Progress, url, event)
    } else {
      emitter.emit(DVMEvent.Result, url, event)

      if (autoClose) {
        sub.close()
      }
    }
  })

  return {request, emitter, sub, pub} as DVMRequest
}
