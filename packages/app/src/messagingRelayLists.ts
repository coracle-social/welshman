import {MESSAGING_RELAYS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {deriveItemsByKey, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem, getter} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relayLists.js"

export const messagingRelayListsByPubkey = deriveItemsByKey({
  repository,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  filters: [{kinds: [MESSAGING_RELAYS]}],
  getKey: messagingRelayLists => messagingRelayLists.event.pubkey,
})

export const messagingRelayLists = deriveItems(messagingRelayListsByPubkey)

export const getMessagingRelayListsByPubkey = getter(messagingRelayListsByPubkey)

export const getMessagingRelayList = (pubkey: string) => getMessagingRelayListsByPubkey().get(pubkey)

export const forceLoadMessagingRelayList = makeForceLoadItem(makeOutboxLoader(MESSAGING_RELAYS), getMessagingRelayList)

export const loadMessagingRelayList = makeLoadItem(makeOutboxLoader(MESSAGING_RELAYS), getMessagingRelayList)

export const deriveMessagingRelayList = makeDeriveItem(messagingRelayListsByPubkey, loadMessagingRelayList)
