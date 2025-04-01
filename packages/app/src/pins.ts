import {PINS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {load, MultiRequestOptions} from "@welshman/net"
import {deriveEventsMapped} from "@welshman/store"
import {repository} from "./core.js"
import {Router} from "./router.js"
import {collection} from "./collection.js"
import {loadRelaySelections} from "./relaySelections.js"

export const pins = deriveEventsMapped<PublishedList>(repository, {
  filters: [{kinds: [PINS]}],
  itemToEvent: item => item.event,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
})

export const {
  indexStore: pinsByPubkey,
  deriveItem: derivePins,
  loadItem: loadPins,
} = collection({
  name: "pins",
  store: pins,
  getKey: pins => pins.event.pubkey,
  load: async (pubkey: string, request: Partial<MultiRequestOptions> = {}) => {
    await loadRelaySelections(pubkey, request)

    const filters = [{kinds: [PINS], authors: [pubkey]}]
    const relays = Router.get().FromPubkey(pubkey).getUrls()

    await load({relays, ...request, filters})
  },
})
