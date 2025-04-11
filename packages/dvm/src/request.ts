import {Emitter, now} from "@welshman/lib"
import {TrustedEvent, SignedEvent, Filter} from "@welshman/util"
import {request, publish, AdapterContext} from "@welshman/net"

export type DVMRequestOptions = {
  event: SignedEvent
  relays: string[]
  timeout?: number
  autoClose?: boolean
  context?: AdapterContext
  onResult?: (event: TrustedEvent, url: string) => void
  onProgress?: (event: TrustedEvent, url: string) => void
}

export const requestDvmResponse = (options: DVMRequestOptions) => {
  const {
    event,
    relays,
    context,
    timeout = 30_000,
    autoClose = true,
    onResult,
    onProgress,
  } = options
  const kind = event.kind + 1000
  const kinds = onProgress ? [kind, 7000] : [kind]
  const filters: Filter[] = [{kinds, since: now() - 60, "#e": [event.id]}]
  const abortController = new AbortController()
  const signal = AbortSignal.any([abortController.signal, AbortSignal.timeout(timeout)])

  return request({
    signal,
    relays,
    filters,
    context,
    onEvent: (event: TrustedEvent, url: string) => {
      if (event.kind === 7000) {
        onProgress?.(event, url)
      } else {
        onResult?.(event, url)

        if (autoClose) {
          abortController.abort()
        }
      }
    },
  })
}

export const makeDvmRequest = (options: DVMRequestOptions) =>
  Promise.all([publish(options), requestDvmResponse(options)])
