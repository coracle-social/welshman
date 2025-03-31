import {Emitter, now} from "@welshman/lib"
import {TrustedEvent, SignedEvent, Filter} from "@welshman/util"
import {
  multireq,
  multicast,
  Multireq,
  Multicast,
  RequestEventType,
  AdapterContext,
} from "@welshman/net"

export enum DVMEvent {
  Progress = "progress",
  Result = "result",
}

export type DVMRequestOptions = {
  event: SignedEvent
  relays: string[]
  context: AdapterContext
  timeout?: number
  autoClose?: boolean
  reportProgress?: boolean
}

export type DVMRequest = {
  request: DVMRequestOptions
  emitter: Emitter
  sub: Multireq
  pub: Multicast
}

export const makeDvmRequest = (request: DVMRequestOptions) => {
  const emitter = new Emitter()
  const {
    event,
    relays,
    context,
    timeout = 30_000,
    autoClose = true,
    reportProgress = true,
  } = request
  const kind = event.kind + 1000
  const kinds = reportProgress ? [kind, 7000] : [kind]
  const filter: Filter = {kinds, since: now() - 60, "#e": [event.id]}

  const sub = multireq({relays, filter, timeout, context})
  const pub = multicast({relays, event, timeout, context})

  sub.on(RequestEventType.Event, (event: TrustedEvent, url: string) => {
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
