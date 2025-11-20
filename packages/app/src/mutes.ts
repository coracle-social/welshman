import {MUTES, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {deriveItemsByKey, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem, getter} from "@welshman/store"
import {repository} from "./core.js"
import {ensurePlaintext} from "./plaintext.js"
import {makeOutboxLoader} from "./relayLists.js"

export const muteListsByPubkey = deriveItemsByKey<PublishedList>({
  repository,
  eventToItem: async (event: TrustedEvent) =>
    readList(
      asDecryptedEvent(event, {
        content: await ensurePlaintext(event),
      }),
    ),
  filters: [{kinds: [MUTES]}],
  getKey: mute => mute.event.pubkey,
})

export const muteLists = deriveItems(muteListsByPubkey)

export const getMuteListsByPubkey = getter(muteListsByPubkey)

export const getMuteLists = getter(muteLists)

export const getMuteList = (pubkey: string) => getMuteListsByPubkey().get(pubkey)

export const forceLoadMuteList = makeForceLoadItem(makeOutboxLoader(MUTES), getMuteList)

export const loadMuteList = makeLoadItem(makeOutboxLoader(MUTES), getMuteList)

export const deriveMuteList = makeDeriveItem(muteListsByPubkey, loadMuteList)
