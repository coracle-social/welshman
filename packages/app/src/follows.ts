import {FOLLOWS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {deriveItemsByKey, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem, getter} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relayLists.js"

export const followListsByPubkey = deriveItemsByKey({
  repository,
  filters: [{kinds: [FOLLOWS]}],
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  getKey: followList => followList.event.pubkey,
})

export const followLists = deriveItems(followListsByPubkey)

export const getFollowListsByPubkey = getter(followListsByPubkey)

export const getFollowLists = getter(followLists)

export const getFollowList = (pubkey: string) => getFollowListsByPubkey().get(pubkey)

export const forceLoadFollowList = makeForceLoadItem(makeOutboxLoader(FOLLOWS), getFollowList)

export const loadFollowList = makeLoadItem(makeOutboxLoader(FOLLOWS), getFollowList)

export const deriveFollowList = makeDeriveItem(followListsByPubkey, loadFollowList)
