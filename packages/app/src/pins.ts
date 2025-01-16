import {PINS, asDecryptedEvent, readList} from "@welshman/util"
import {type TrustedEvent, type PublishedList} from "@welshman/util"
import {type SubscribeRequestWithHandlers} from "@welshman/net"
import {deriveEventsMapped} from "@welshman/store"
import {repository} from "./core.js"
import {load} from "./subscribe.js"
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
  load: async (pubkey: string, request: Partial<SubscribeRequestWithHandlers> = {}) => {
    await loadRelaySelections(pubkey, request)
    await load({...request, filters: [{kinds: [PINS], authors: [pubkey]}]})
  },
})
