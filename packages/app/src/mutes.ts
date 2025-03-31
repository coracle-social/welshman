import {MUTES, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {load, MultiRequestOptions} from "@welshman/net"
import {deriveEventsMapped} from "@welshman/store"
import {repository} from "./core.js"
import {Router} from "./router.js"
import {collection} from "./collection.js"
import {ensurePlaintext} from "./plaintext.js"
import {loadRelaySelections} from "./relaySelections.js"

export const mutes = deriveEventsMapped<PublishedList>(repository, {
  filters: [{kinds: [MUTES]}],
  itemToEvent: item => item.event,
  eventToItem: async (event: TrustedEvent) =>
    readList(
      asDecryptedEvent(event, {
        content: await ensurePlaintext(event),
      }),
    ),
})

export const {
  indexStore: mutesByPubkey,
  deriveItem: deriveMutes,
  loadItem: loadMutes,
} = collection({
  name: "mutes",
  store: mutes,
  getKey: mute => mute.event.pubkey,
  load: async (pubkey: string, request: Partial<MultiRequestOptions> = {}) => {
    await loadRelaySelections(pubkey, request)

    const filter = {kinds: [MUTES], authors: [pubkey]}
    const relays = Router.get().FromPubkey(pubkey).getUrls()

    await load({relays, ...request, filter})
  },
})
