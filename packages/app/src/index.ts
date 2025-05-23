export * from "./blossom.js"
export * from "./context.js"
export * from "./core.js"
export * from "./commands.js"
export * from "./feeds.js"
export * from "./follows.js"
export * from "./handles.js"
export * from "./mutes.js"
export * from "./plaintext.js"
export * from "./profiles.js"
export * from "./pins.js"
export * from "./relays.js"
export * from "./relaySelections.js"
export * from "./search.js"
export * from "./session.js"
export * from "./storage.js"
export * from "./storageAdapters.js"
export * from "./sync.js"
export * from "./tags.js"
export * from "./thunk.js"
export * from "./topics.js"
export * from "./user.js"
export * from "./wot.js"
export * from "./zappers.js"

import {sortBy, throttleWithValue, tryCatch} from "@welshman/lib"
import {verifyEvent, isEphemeralKind, isDVMKind} from "@welshman/util"
import {routerContext} from "@welshman/router"
import {Pool, SocketEvent, isRelayEvent} from "@welshman/net"
import {pubkey} from "./session.js"
import {repository, tracker} from "./core.js"
import {getPubkeyRelays} from "./relaySelections.js"
import {Relay, relays, loadRelay, trackRelayStats, getRelayQuality} from "./relays.js"

// Sync relays with our database

Pool.get().subscribe(socket => {
  loadRelay(socket.url)
  trackRelayStats(socket)

  socket.on(SocketEvent.Receive, message => {
    if (isRelayEvent(message)) {
      const event = message[2]

      if (!isEphemeralKind(event.kind) && !isDVMKind(event.kind) && verifyEvent(event)) {
        tracker.track(event.id, socket.url)
        repository.publish(event)
      }
    }
  })
})

// Configure the router

const _relayGetter = (fn?: (relay: Relay) => any) =>
  throttleWithValue(200, () => {
    let _relays = relays.get()

    if (fn) {
      _relays = _relays.filter(fn)
    }

    return sortBy(r => -getRelayQuality(r.url), _relays)
      .slice(0, 5)
      .map(r => r.url)
  })

routerContext.getUserPubkey = () => pubkey.get()
routerContext.getPubkeyRelays = getPubkeyRelays
routerContext.getRelayQuality = getRelayQuality
routerContext.getDefaultRelays = _relayGetter()
routerContext.getIndexerRelays = _relayGetter()
routerContext.getSearchRelays = _relayGetter(r =>
  tryCatch(() => r.profile?.supported_nips?.includes(50)),
)
