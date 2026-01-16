import {BLOCKED_RELAYS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent} from "@welshman/util"
import {
  deriveItemsByKey,
  deriveItems,
  makeForceLoadItem,
  makeLoadItem,
  makeDeriveItem,
  getter,
} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relayLists.js"

export const blockedRelayListsByPubkey = deriveItemsByKey({
  repository,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  filters: [{kinds: [BLOCKED_RELAYS]}],
  getKey: blockedRelayLists => blockedRelayLists.event.pubkey,
})

export const blockedRelayLists = deriveItems(blockedRelayListsByPubkey)

export const getBlockedRelayListsByPubkey = getter(blockedRelayListsByPubkey)

export const getBlockedRelayLists = getter(blockedRelayLists)

export const getBlockedRelayList = (pubkey: string) => getBlockedRelayListsByPubkey().get(pubkey)

export const forceLoadBlockedRelayList = makeForceLoadItem(
  makeOutboxLoader(BLOCKED_RELAYS),
  getBlockedRelayList,
)

export const loadBlockedRelayList = makeLoadItem(
  makeOutboxLoader(BLOCKED_RELAYS),
  getBlockedRelayList,
)

export const deriveBlockedRelayList = makeDeriveItem(
  blockedRelayListsByPubkey,
  loadBlockedRelayList,
)
