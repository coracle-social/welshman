import {PINS, asDecryptedEvent, readList} from "@welshman/util"
import {TrustedEvent} from "@welshman/util"
import {
  deriveItemsByKey,
  deriveItems,
  makeForceLoadItem,
  makeLoadItem,
  makeDeriveItem,
  getter,
} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoader} from "./relayLists.js"

export const pinListsByPubkey = deriveItemsByKey({
  repository,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  filters: [{kinds: [PINS]}],
  getKey: pins => pins.event.pubkey,
})

export const pinLists = deriveItems(pinListsByPubkey)

export const getPinListsByPubkey = getter(pinListsByPubkey)

export const getPinLists = getter(pinLists)

export const getPinList = (pubkey: string) => getPinListsByPubkey().get(pubkey)

export const forceLoadPinList = makeForceLoadItem(makeOutboxLoader(PINS), getPinList)

export const loadPinList = makeLoadItem(makeOutboxLoader(PINS), getPinList)

export const derivePinList = makeDeriveItem(pinListsByPubkey, loadPinList)
