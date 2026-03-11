import {SEARCH_RELAYS, asDecryptedEvent, readList} from "@welshman/util"
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

export const searchRelayListsByPubkey = deriveItemsByKey({
  repository,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  filters: [{kinds: [SEARCH_RELAYS]}],
  getKey: searchRelayLists => searchRelayLists.event.pubkey,
})

export const searchRelayLists = deriveItems(searchRelayListsByPubkey)

export const getSearchRelayListsByPubkey = getter(searchRelayListsByPubkey)

export const getSearchRelayLists = getter(searchRelayLists)

export const getSearchRelayList = (pubkey: string) => getSearchRelayListsByPubkey().get(pubkey)

export const forceLoadSearchRelayList = makeForceLoadItem(
  makeOutboxLoader(SEARCH_RELAYS),
  getSearchRelayList,
)

export const loadSearchRelayList = makeLoadItem(makeOutboxLoader(SEARCH_RELAYS), getSearchRelayList)

export const deriveSearchRelayList = makeDeriveItem(searchRelayListsByPubkey, loadSearchRelayList)
