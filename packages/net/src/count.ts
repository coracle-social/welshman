import {call, defer, max, on, randomId, removeUndefined, uniq} from "@welshman/lib"
import {Filter} from "@welshman/util"
import {RelayMessage, ClientMessageType, isRelayClosed, isRelayCount} from "./message.js"
import {getAdapter, AdapterContext, AdapterEvent} from "./adapter.js"
import {SocketEvent, SocketStatus} from "./socket.js"

export const COUNT_TIMEOUT = 3000

// Which relays answer a COUNT, read off the wire rather than from NIP-11. A relay that
// refused once is not asked again.
const supportByRelay = new Map<string, boolean>()

export const supportsCount = (relay: string) => supportByRelay.get(relay)

export type CountOneOptions = {
  relay: string
  filters: Filter[]
  context?: AdapterContext
  signal?: AbortSignal
}

/**
 * Asks one relay how many events match the given filters (NIP-45).
 * @param options - CountOneOptions
 * @returns the relay's count, or undefined if it does not support COUNT
 */
export const countOne = (options: CountOneOptions) => {
  const deferred = defer<number | undefined>()

  if (options.signal?.aborted || supportByRelay.get(options.relay) === false) {
    deferred.resolve(undefined)

    return deferred
  }

  const id = `COUNT-${randomId().slice(0, 8)}`
  const adapter = getAdapter(options.relay, options.context)

  let closed = false

  const finish = (result: number | undefined) => {
    if (closed) return

    closed = true

    clearTimeout(timeoutId)
    adapter.cleanup()
    unsubscribers.map(call)
    deferred.resolve(result)
  }

  // Only the relay's own answer says whether it supports COUNT
  const remember = (supported: boolean, result?: number) => {
    supportByRelay.set(options.relay, supported)
    finish(result)
  }

  const unsubscribers = [
    on(adapter, AdapterEvent.Receive, (message: RelayMessage) => {
      if (isRelayCount(message) && message[1] === id) {
        remember(true, message[2].count)
      }

      if (isRelayClosed(message) && message[1] === id) {
        remember(false)
      }
    }),
  ]

  for (const socket of adapter.sockets) {
    unsubscribers.push(
      on(socket, SocketEvent.Status, (status: SocketStatus) => {
        if (![SocketStatus.Open, SocketStatus.Opening].includes(status)) {
          finish(undefined)
        }
      }),
    )
  }

  if (options.signal) {
    const signal = options.signal
    const abort = () => finish(undefined)

    signal.addEventListener("abort", abort)
    unsubscribers.push(() => signal.removeEventListener("abort", abort))
  }

  // A relay that does not know the verb usually says nothing, so silence is a refusal too
  const timeoutId = setTimeout(() => remember(false), COUNT_TIMEOUT)

  adapter.send([ClientMessageType.Count, id, ...options.filters])

  return deferred
}

export type CountOptions = {
  relays: string[]
  filters: Filter[]
  context?: AdapterContext
  signal?: AbortSignal
}

/**
 * Asks several relays how many events match the given filters (NIP-45). Relays hold
 * overlapping subsets of the network, so the highest answer is a lower bound.
 * @param options - CountOptions
 * @returns the highest count given, or undefined if no relay supports COUNT
 */
export const count = async (options: CountOptions) => {
  const counts = removeUndefined(
    await Promise.all(uniq(options.relays).map(relay => countOne({...options, relay}))),
  )

  return counts.length > 0 ? max(counts) : undefined
}
