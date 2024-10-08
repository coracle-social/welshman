import {partition} from "@welshman/lib"
import {defaultOptimizeSubscriptions, getDefaultNetContext as originalGetDefaultNetContext} from "@welshman/net"
import type {Subscription, RelaysAndFilters, NetContext} from "@welshman/net"
import {WRAP, unionFilters, isSignedEvent, hasValidSignature} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {tracker, repository} from './core'
import {makeRouter, getFilterSelections} from './router'
import {onAuth, getSession} from './session'
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
  onAuth: onAuth,
  onEvent: (url: string, event: TrustedEvent) => {
    tracker.track(event.id, url)
    repository.publish(event)

    // Eagerly load profiles since they're critical to UX
    if (event.kind !== WRAP) {
      loadProfile(event.pubkey)
    }
  },
  isDeleted: (url: string, event: TrustedEvent) => repository.isDeleted(event),
  isValid: (url: string, event: TrustedEvent) =>
    getSession(event.pubkey) || (isSignedEvent(event) && hasValidSignature(event)),
  optimizeSubscriptions: (subs: Subscription[]) => {
    const [withRelays, withoutRelays] = partition(sub => sub.request.relays.length > 0, subs)
    const filters = unionFilters(withoutRelays.flatMap(sub => sub.request.filters))
    const selections: RelaysAndFilters[] = defaultOptimizeSubscriptions(withRelays)

    if (filters.length > 0) {
      for (const selection of  getFilterSelections(filters)) {
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

