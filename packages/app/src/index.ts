export * from './core'
export * from './collection'
export * from './freshness'
export * from './follows'
export * from './handles'
export * from './mutes'
export * from './plaintext'
export * from './profiles'
export * from './relays'
export * from './relaySelections'
export * from './router'
export * from './session'
export * from './storage'
export * from './thunk'
export * from './topics'
export * from './util'
export * from './zappers'

import {partition} from "@welshman/lib"
import {type Subscription, NetworkContext, defaultOptimizeSubscriptions} from "@welshman/net"
import {type TrustedEvent, unionFilters} from "@welshman/util"
import {tracker, repository, AppContext} from './core'
import {makeRouter, getFilterSelections} from './router'
import {onAuth} from './session'

export function* optimizeSubscriptions(subs: Subscription[]) {
  const [withRelays, withoutRelays] = partition(sub => sub.request.relays.length > 0, subs)
  const filters = unionFilters(withoutRelays.flatMap(sub => sub.request.filters))

  yield* defaultOptimizeSubscriptions(withRelays)

  if (filters.length > 0) {
    yield* getFilterSelections(filters)
  }
}

Object.assign(NetworkContext, {
  onAuth,
  onEvent: (url: string, event: TrustedEvent) => tracker.track(event.id, url),
  isDeleted: (url: string, event: TrustedEvent) => repository.isDeleted(event),
  optimizeSubscriptions,
})

Object.assign(AppContext, {
  router: makeRouter(),
})
