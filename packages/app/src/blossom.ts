import {BLOSSOM_SERVERS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {deriveItemsByKey, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem, getter} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relayLists.js"

export const blossomServerListsByPubkey = deriveItemsByKey({
  repository,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  filters: [{kinds: [BLOSSOM_SERVERS]}],
  getKey: blossomServerList => blossomServerList.event.pubkey,
})

export const blossomServerLists = deriveItems(blossomServerListsByPubkey)

export const getBlossomServerListsByPubkey = getter(blossomServerListsByPubkey)

export const getBlossomServerList = (pubkey: string) => getBlossomServerListsByPubkey().get(pubkey)

export const forceLoadBlossomServerList = makeForceLoadItem(makeOutboxLoader(BLOSSOM_SERVERS), getBlossomServerList)

export const loadBlossomServerList = makeLoadItem(makeOutboxLoader(BLOSSOM_SERVERS), getBlossomServerList)

export const deriveBlossomServerList = makeDeriveItem(blossomServerListsByPubkey, loadBlossomServerList)
