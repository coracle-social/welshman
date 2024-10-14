import {ctx, uniq, noop, always} from '@welshman/lib'
import {matchFilters, unionFilters, isSignedEvent, hasValidSignature} from '@welshman/util'
import type {StampedEvent, SignedEvent, Filter, TrustedEvent} from '@welshman/util'
import {Pool} from "./Pool"
import {Executor} from "./Executor"
import {AuthMode} from "./ConnectionAuth"
import {Relays} from "./target/Relays"
import type {Subscription, RelaysAndFilters} from "./Subscribe"

export type NetContext = {
  pool: Pool
  authMode: AuthMode,
  onEvent: (url: string, event: TrustedEvent) => void
  signEvent: (event: StampedEvent) => Promise<SignedEvent>
  getExecutor: (relays: string[]) => Executor
  isDeleted: (url: string, event: TrustedEvent) => boolean
  isValid: (url: string, event: TrustedEvent) => boolean
  matchFilters: (url: string, filters: Filter[], event: TrustedEvent) => boolean
  optimizeSubscriptions: (subs: Subscription[]) => RelaysAndFilters[]
}

export const defaultOptimizeSubscriptions = (subs: Subscription[]) =>
  uniq(subs.flatMap(sub => sub.request.relays || []))
    .map(relay => {
      const relaySubs = subs.filter(sub => sub.request.relays.includes(relay))
      const filters = unionFilters(relaySubs.flatMap(sub => sub.request.filters))

      return {relays: [relay], filters}
    })

export const getDefaultNetContext = (overrides: Partial<NetContext> = {}) => ({
  pool: new Pool(),
  authMode: AuthMode.Implicit,
  onEvent: noop,
  signEvent: noop,
  isDeleted: always(false),
  isValid: (url: string, event: TrustedEvent) => isSignedEvent(event) && hasValidSignature(event),
  getExecutor: (relays: string[]) => new Executor(new Relays(relays.map((relay: string) => ctx.net.pool.get(relay)))),
  matchFilters: (url: string, filters: Filter[], event: TrustedEvent) => matchFilters(filters, event),
  optimizeSubscriptions: defaultOptimizeSubscriptions,
  ...overrides,
})
