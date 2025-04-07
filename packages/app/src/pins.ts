import {PINS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {load, MultiRequestOptions} from "@welshman/net"
import {deriveEventsMapped} from "@welshman/store"
import {repository} from "./core.js"
import {Router} from "./router.js"
import {collection} from "./collection.js"
import {loadWithAsapMetaRelayUrls} from "./relaySelections.js"

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
  load: (pubkey: string, relays: string[]) =>
    loadWithAsapMetaRelayUrls(pubkey, relays, [{kinds: [PINS], authors: [pubkey]}]),
})
