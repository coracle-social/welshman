import {chunk, first} from "@welshman/lib"
import {
  RELAYS,
  asDecryptedEvent,
  readList,
  TrustedEvent,
  sortEventsDesc,
  getRelaysFromList,
  RelayMode,
  Filter,
  isPlainReplaceableKind,
} from "@welshman/util"
import {
  deriveItemsByKey,
  deriveItems,
  makeForceLoadItem,
  makeLoadItem,
  makeDeriveItem,
  getter,
} from "@welshman/store"
import {load} from "@welshman/net"
import {Router, addMinimalFallbacks} from "@welshman/router"
import {repository} from "./core.js"

export const fetchRelayList = async (pubkey: string, relayHints: string[] = []) => {
  const filters = [{kinds: [RELAYS], authors: [pubkey], limit: 1}]

  await Promise.all([
    load({filters, relays: Router.get().FromRelays(relayHints).getUrls()}),
    load({filters, relays: Router.get().FromPubkey(pubkey).getUrls()}),
    load({filters, relays: Router.get().Index().getUrls()}),
  ])
}

export const relayListsByPubkey = deriveItemsByKey({
  repository,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  filters: [{kinds: [RELAYS]}],
  getKey: relayList => relayList.event.pubkey,
})

export const relayLists = deriveItems(relayListsByPubkey)

export const getRelayListsByPubkey = getter(relayListsByPubkey)

export const getRelayLists = getter(relayLists)

export const getRelayList = (pubkey: string) => getRelayListsByPubkey().get(pubkey)

export const forceLoadRelayList = makeForceLoadItem(fetchRelayList, getRelayList)

export const loadRelayList = makeLoadItem(fetchRelayList, getRelayList)

export const deriveRelayList = makeDeriveItem(relayListsByPubkey, loadRelayList)

// Outbox loader

export const loadUsingOutbox = async (kind: number, pubkey: string, filter: Filter = {}) => {
  const filters = [{...filter, kinds: [kind], authors: [pubkey]}]
  const writeRelays = getRelaysFromList(await loadRelayList(pubkey), RelayMode.Write)
  const allRelays = Router.get()
    .FromRelays(writeRelays)
    .policy(addMinimalFallbacks)
    .limit(8)
    .getUrls()

  if (isPlainReplaceableKind(kind)) {
    filters[0].limit = 1
  }

  for (const relays of chunk(2, allRelays)) {
    const events = await load({filters, relays})

    if (events.length > 0) {
      return first(sortEventsDesc(events))
    }
  }
}

export const makeOutboxLoader =
  (kind: number, filter: Filter = {}, limit = 1) =>
  async (pubkey: string, relayHints: string[] = []) => {
    const filters = [{...filter, kinds: [kind], authors: [pubkey]}]
    const relays = Router.get().FromRelays(relayHints).getUrls()

    await Promise.all([load({filters, relays}), loadUsingOutbox(kind, pubkey, filter)])
  }
