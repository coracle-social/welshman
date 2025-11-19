import {PINS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent, PublishedList} from "@welshman/util"
import {deriveItemsByKey, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem, getter} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relaySelections.js"

export const pinsByPubkey = deriveItemsByKey({
  repository,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  filters: [{kinds: [PINS]}],
  getKey: pins => pins.event.pubkey,
})

export const pins = deriveItems(pinsByPubkey)

export const getPinsByPubkey = getter(pinsByPubkey)

export const getPins = (pubkey: string) => getPinsByPubkey().get(pubkey)

export const forceLoadPins = makeForceLoadItem(makeOutboxLoader(PINS), getPins)

export const loadPins = makeLoadItem(makeOutboxLoader(PINS), getPins)

export const derivePins = makeDeriveItem(pinsByPubkey, loadPins)
