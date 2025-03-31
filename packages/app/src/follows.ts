import {FOLLOWS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {MultiRequestOptions, load} from "@welshman/net"
import {deriveEventsMapped} from "@welshman/store"
import {repository} from "./core.js"
import {Router} from "./router.js"
import {collection} from "./collection.js"
import {loadRelaySelections} from "./relaySelections.js"

export const follows = deriveEventsMapped<PublishedList>(repository, {
  filters: [{kinds: [FOLLOWS]}],
  itemToEvent: item => item.event,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
})

export const {
  indexStore: followsByPubkey,
  deriveItem: deriveFollows,
  loadItem: loadFollows,
} = collection({
  name: "follows",
  store: follows,
  getKey: follows => follows.event.pubkey,
  load: async (pubkey: string, request: Partial<MultiRequestOptions> = {}) => {
    await loadRelaySelections(pubkey, request)

    const filter = {kinds: [FOLLOWS], authors: [pubkey]}
    const relays = Router.getInstance().FromPubkey(pubkey).getUrls()

    await load({relays, ...request, filter})
  },
})
