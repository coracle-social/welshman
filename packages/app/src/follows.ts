import {FOLLOWS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {deriveItemsByKey, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem, getter} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const followsByPubkey = deriveItemsByKey({
  repository,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  filters: [{kinds: [FOLLOWS]}],
  getKey: follows => follows.event.pubkey,
})

export const follows = deriveItems(followsByPubkey)

export const getFollowsByPubkey = getter(followsByPubkey)

export const getFollows = (pubkey: string) => getFollowsByPubkey().get(pubkey)

export const forceLoadFollows = makeForceLoadItem(makeOutboxLoader(FOLLOWS), getFollows)

export const loadFollows = makeLoadItem(makeOutboxLoader(FOLLOWS), getFollows)

export const deriveFollows = makeDeriveItem(followsByPubkey, loadFollows)
