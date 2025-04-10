import {Emitter, now} from "@welshman/lib"
import {TrustedEvent, SignedEvent, Filter} from "@welshman/util"
import {request, MultiPublish, AdapterContext} from "@welshman/net"

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
  context?: AdapterContext
}

export type DVMRequest = {
  options: DVMRequestOptions
  emitter: Emitter
  pub: MultiPublish
}

export const makeDvmRequest = (options: DVMRequestOptions) => {
  const emitter = new Emitter()
  const {
    event,
    relays,
    context,
    timeout = 30_000,
    autoClose = true,
    reportProgress = true,
  } = options
  const kind = event.kind + 1000
  const kinds = reportProgress ? [kind, 7000] : [kind]
  const filters: Filter[] = [{kinds, since: now() - 60, "#e": [event.id]}]
  const abortController = new AbortController()
  const signal = AbortSignal.any([abortController.signal, AbortSignal.timeout(timeout)])

  request({
    signal,
    relays,
    filters,
    context,
    onEvent: (event: TrustedEvent, url: string) => {
      if (event.kind === 7000) {
        emitter.emit(DVMEvent.Progress, url, event)
      } else {
        emitter.emit(DVMEvent.Result, url, event)

        if (autoClose) {
          abortController.abort()
        }
      }
    },
  })

  const pub = new MultiPublish({relays, event, timeout, context})


  return {options, emitter, pub} as DVMRequest
}
