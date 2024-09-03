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

import {NetworkContext} from "@welshman/net"
import {type TrustedEvent} from "@welshman/util"
import {tracker, repository, AppContext} from './core'
import {splitRequest, makeRouter} from './router'
import {onAuth} from './session'

Object.assign(NetworkContext, {
  onAuth,
  onEvent: (url: string, event: TrustedEvent) => tracker.track(event.id, url),
  isDeleted: (url: string, event: TrustedEvent) => repository.isDeleted(event),
})

Object.assign(AppContext, {
  splitRequest,
  router: makeRouter(),
})
