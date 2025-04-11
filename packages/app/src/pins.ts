import {PINS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {deriveEventsMapped} from "@welshman/store"
import {repository} from "./core.js"
import {collection} from "./collection.js"
import {makeOutboxLoader} from "./relaySelections.js"

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
  load: makeOutboxLoader(PINS)
})
