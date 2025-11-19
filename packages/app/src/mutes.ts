import {MUTES, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {deriveItemsByKey, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem, getter} from "@welshman/store"
import {repository} from "./core.js"
import {ensurePlaintext} from "./plaintext.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const mutesByPubkey = deriveItemsByKey({
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

export const mutes = deriveItems(mutesByPubkey)

export const getMutesByPubkey = getter(mutesByPubkey)

export const getMutes = (pubkey: string) => getMutesByPubkey().get(pubkey)

export const forceLoadMutes = makeForceLoadItem(makeOutboxLoader(MUTES), getMutes)

export const loadMutes = makeLoadItem(makeOutboxLoader(MUTES), getMutes)

export const deriveMutes = makeDeriveItem(mutesByPubkey, loadMutes)
