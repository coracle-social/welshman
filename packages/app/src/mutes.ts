import {MUTES, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {
  deriveItemsByKey,
  deriveItems,
  makeForceLoadItem,
  makeLoadItem,
  makeDeriveItem,
  getter,
} from "@welshman/store"
import {repository} from "./core.js"
import {ensurePlaintext} from "./plaintext.js"
import {getSession} from "./session.js"
import {makeOutboxLoader} from "./relayLists.js"

export const muteListsByPubkey = deriveItemsByKey<PublishedList>({
  repository,
  eventToItem: async (event: TrustedEvent) => {
    const content = await ensurePlaintext(event)

    // If this is our own mute list (we have a session for it) but it couldn't be
    // decrypted yet because no signer is available, don't cache a result with empty
    // private tags — that would get stuck permanently since deriveItemsByKey won't
    // re-process an already-seen event id. Returning undefined leaves it uncached so it's
    // retried once a signer is available. For other pubkeys' lists (no session) we fall
    // through and read just the public tags, as before.
    if (event.content && content === undefined && getSession(event.pubkey)) {
      return undefined
    }

    return readList(asDecryptedEvent(event, {content}))
  },
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
