import {partition} from "@welshman/lib"
import {defaultOptimizeSubscriptions, getDefaultNetContext as originalGetDefaultNetContext} from "@welshman/net"
import type {Subscription, RelaysAndFilters, NetContext} from "@welshman/net"
import {WRAP, LOCAL_RELAY_URL, isEphemeralKind, isDVMKind,  unionFilters} from "@welshman/util"
import type {TrustedEvent, StampedEvent} from "@welshman/util"
import {tracker, repository} from './core'
import {makeRouter, getFilterSelections} from './router'
import {signer} from './session'
import type {Router} from './router'
import {loadProfile} from './profiles'

export type AppContext = {
  router: Router
  requestDelay: number
  authTimeout: number
  requestTimeout: number
  dufflepudUrl?: string
  indexerRelays?: string[]
}

export const getDefaultNetContext = (overrides: Partial<NetContext> = {}) => ({
  ...originalGetDefaultNetContext(),
  signEvent: (event: StampedEvent) => signer.get()?.sign(event),
  onEvent: (url: string, event: TrustedEvent) => {
    if (isEphemeralKind(event.kind) || isDVMKind(event.kind)) return

    tracker.track(event.id, url)
    repository.publish(event)

    // Eagerly load profiles since they're critical to UX
    if (event.kind !== WRAP) {
      loadProfile(event.pubkey)
    }
  },
  isDeleted: (url: string, event: TrustedEvent) => repository.isDeleted(event),
  optimizeSubscriptions: (subs: Subscription[]) => {
    const [withRelays, withoutRelays] = partition(sub => sub.request.relays.length > 0, subs)
    const filters = unionFilters(withoutRelays.flatMap(sub => sub.request.filters))
    const selections: RelaysAndFilters[] = defaultOptimizeSubscriptions(withRelays)

    selections.push({relays: [LOCAL_RELAY_URL], filters})

    if (filters.length > 0) {
      for (const selection of getFilterSelections(filters)) {
        selections.push(selection)
      }
    }

    return selections
  },
  ...overrides,
})

export const getDefaultAppContext = (overrides: Partial<AppContext> = {}) => ({
  router: makeRouter(),
  requestDelay: 50,
  authTimeout: 300,
  requestTimeout: 3000,
  ...overrides,
})

