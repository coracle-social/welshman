import {INBOX_RELAYS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {deriveItemsByKey, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem, getter} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const inboxRelaySelectionsByPubkey = deriveItemsByKey({
  repository,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  filters: [{kinds: [INBOX_RELAYS]}],
  getKey: inboxRelaySelections => inboxRelaySelections.event.pubkey,
})

export const inboxRelaySelections = deriveItems(inboxRelaySelectionsByPubkey)

export const getInboxRelaySelectionsByPubkey = getter(inboxRelaySelectionsByPubkey)

export const getInboxRelaySelections = (pubkey: string) => getInboxRelaySelectionsByPubkey().get(pubkey)

export const forceLoadInboxRelaySelections = makeForceLoadItem(makeOutboxLoader(INBOX_RELAYS), getInboxRelaySelections)

export const loadInboxRelaySelections = makeLoadItem(makeOutboxLoader(INBOX_RELAYS), getInboxRelaySelections)

export const deriveInboxRelaySelections = makeDeriveItem(inboxRelaySelectionsByPubkey, loadInboxRelaySelections)
