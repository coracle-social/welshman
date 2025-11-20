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
export * from "./relayStats.js"
export * from "./relayLists.js"
export * from "./messagingRelayLists.js"
export * from "./search.js"
export * from "./session.js"
export * from "./sync.js"
export * from "./tags.js"
export * from "./thunk.js"
export * from "./topics.js"
export * from "./user.js"
export * from "./wot.js"
export * from "./zappers.js"

import {derived} from "svelte/store"
import {sortBy, throttleWithValue} from "@welshman/lib"
import {
  isEphemeralKind,
  isDVMKind,
  WRAP,
  RelayMode,
  RelayProfile,
  getRelaysFromList,
} from "@welshman/util"
import {routerContext} from "@welshman/router"
import {Pool, SocketEvent, isRelayEvent, netContext} from "@welshman/net"
import {pubkey, unwrapAndStore} from "./session.js"
import {repository, tracker} from "./core.js"
import {getRelays, loadRelay} from "./relays.js"
import {trackRelayStats, getRelayQuality} from "./relayStats.js"
import {deriveRelayList, getRelayList} from "./relayLists.js"
import {deriveMessagingRelayList, getMessagingRelayList} from "./messagingRelayLists.js"

// Sync relays with our database

Pool.get().subscribe(socket => {
  loadRelay(socket.url)
  trackRelayStats(socket)

  socket.on(SocketEvent.Receive, message => {
    if (isRelayEvent(message)) {
      const event = message[2]

      if (
        !isDVMKind(event.kind) &&
        !isEphemeralKind(event.kind) &&
        netContext.isEventValid(event, socket.url)
      ) {
        tracker.track(event.id, socket.url)

        if (event.kind === WRAP) {
          unwrapAndStore(event)
        } else {
          repository.publish(event)
        }
      }
    }
  })
})

// Configure the router and add a few other relay utils

const _relayGetter = (fn?: (relay: RelayProfile) => any) =>
  throttleWithValue(200, () => {
    let _relays = getRelays()

    if (fn) {
      _relays = _relays.filter(fn)
    }

    return sortBy(r => -getRelayQuality(r.url), _relays)
      .slice(0, 5)
      .map(r => r.url)
  })

export const getPubkeyRelays = (pubkey: string, mode?: RelayMode) =>
  mode === RelayMode.Messaging
    ? getRelaysFromList(getMessagingRelayList(pubkey))
    : getRelaysFromList(getRelayList(pubkey), mode)

export const derivePubkeyRelays = (pubkey: string, mode?: RelayMode) =>
  mode === RelayMode.Messaging
    ? derived(deriveMessagingRelayList(pubkey), list => getRelaysFromList(list))
    : derived(deriveRelayList(pubkey), list => getRelaysFromList(list, mode))

routerContext.getUserPubkey = () => pubkey.get()
routerContext.getPubkeyRelays = getPubkeyRelays
routerContext.getRelayQuality = getRelayQuality
routerContext.getDefaultRelays = _relayGetter()
routerContext.getIndexerRelays = _relayGetter()
routerContext.getSearchRelays = _relayGetter(r => r?.supported_nips?.includes?.(50))
