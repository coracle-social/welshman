import {ctx, uniq, noop, always} from '@welshman/lib'
import {matchFilters, unionFilters, isSignedEvent, hasValidSignature} from '@welshman/util'
import type {Filter, TrustedEvent} from '@welshman/util'
import {Pool} from "./Pool"
import {Executor} from "./Executor"
import {Relays} from "./target/Relays"
import type {Subscription, RelaysAndFilters} from "./Subscribe"

export type NetContext = {
  pool: Pool
  getExecutor: (relays: string[]) => Executor
  onEvent: (url: string, event: TrustedEvent) => void
  onAuth: (url: string, challenge: string) => void
  onOk: (url: string, id: string, ok: boolean, message: string) => void
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
  onOk: noop,
  onAuth: noop,
  onEvent: noop,
  pool: new Pool(),
  isDeleted: always(false),
  isValid: (url: string, event: TrustedEvent) => isSignedEvent(event) && hasValidSignature(event),
  getExecutor: (relays: string[]) => new Executor(new Relays(relays.map((relay: string) => ctx.net.pool.get(relay)))),
  matchFilters: (url: string, filters: Filter[], event: TrustedEvent) => matchFilters(filters, event),
  optimizeSubscriptions: defaultOptimizeSubscriptions,
  ...overrides,
})
