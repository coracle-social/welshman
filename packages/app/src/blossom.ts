import {BLOSSOM_SERVERS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {deriveItemsByKey, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem, getter} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const blossomServersByPubkey = deriveItemsByKey({
  repository,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  filters: [{kinds: [BLOSSOM_SERVERS]}],
  getKey: blossomServers => blossomServers.event.pubkey,
})

export const blossomServers = deriveItems(blossomServersByPubkey)

export const getBlossomServersByPubkey = getter(blossomServersByPubkey)

export const getBlossomServers = (pubkey: string) => getBlossomServersByPubkey().get(pubkey)

export const forceLoadBlossomServers = makeForceLoadItem(makeOutboxLoader(BLOSSOM_SERVERS), getBlossomServers)

export const loadBlossomServers = makeLoadItem(makeOutboxLoader(BLOSSOM_SERVERS), getBlossomServers)

export const deriveBlossomServers = makeDeriveItem(blossomServersByPubkey, loadBlossomServers)
