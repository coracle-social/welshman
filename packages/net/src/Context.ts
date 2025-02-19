import {ctx, randomInt, uniq, noop, always} from "@welshman/lib"
import {
  LOCAL_RELAY_URL,
  matchFilters,
  unionFilters,
  isSignedEvent,
  hasValidSignature,
} from "@welshman/util"
import type {StampedEvent, SignedEvent, Filter, TrustedEvent} from "@welshman/util"
import {Pool} from "./Pool.js"
import {Executor} from "./Executor.js"
import {AuthMode} from "./ConnectionAuth.js"
import {Relays} from "./target/Relays.js"
import type {Subscription, RelaysAndFilters} from "./Subscribe.js"

export type NetContext = {
  pool: Pool
  authMode: AuthMode
  onEvent: (url: string, event: TrustedEvent) => void
  signEvent: (event: StampedEvent) => Promise<SignedEvent | undefined>
  getExecutor: (relays: string[]) => Executor
  isDeleted: (url: string, event: TrustedEvent) => boolean
  isValid: (url: string, event: TrustedEvent) => boolean
  matchFilters: (url: string, filters: Filter[], event: TrustedEvent) => boolean
  optimizeSubscriptions: (subs: Subscription[]) => RelaysAndFilters[]
}

export const defaultOptimizeSubscriptions = (subs: Subscription[]) =>
  uniq(subs.flatMap(sub => sub.request.relays || [])).map(relay => {
    const relaySubs = subs.filter(sub => sub.request.relays.includes(relay))
    const filters = unionFilters(relaySubs.flatMap(sub => sub.request.filters))

    return {relays: [relay], filters}
  })

export const eventValidationScores = new Map<string, number>()

export const isEventValid = (url: string, event: TrustedEvent) => {
  if (url === LOCAL_RELAY_URL) return true

  const validCount = eventValidationScores.get(url) || 0

  // The more events we've actually validated from this relay, the more we can trust it.
  if (validCount > randomInt(100, 1000)) return true

  const isValid = isSignedEvent(event) && hasValidSignature(event)

  // If the event was valid, increase the relay's score. If not, reset it
  // Never validate less than 10% to make sure we're never totally checking out
  if (!isValid || validCount < 900) {
    eventValidationScores.set(url, isValid ? validCount + 1 : 0)
  }

  return isValid
}

export const getDefaultNetContext = (overrides: Partial<NetContext> = {}) => ({
  pool: new Pool(),
  authMode: AuthMode.Implicit,
  onEvent: noop,
  signEvent: noop,
  isDeleted: always(false),
  isValid: isEventValid,
  getExecutor: (relays: string[]) =>
    new Executor(new Relays(relays.map((relay: string) => ctx.net.pool.get(relay)))),
  matchFilters: (url: string, filters: Filter[], event: TrustedEvent) =>
    matchFilters(filters, event),
  optimizeSubscriptions: defaultOptimizeSubscriptions,
  ...overrides,
})
