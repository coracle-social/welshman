import {uniq, batcher, flatten} from "@welshman/lib"
import {
  RELAYS,
  asDecryptedEvent,
  readList,
  TrustedEvent,
  unionFilters,
  Filter,
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
  const filters = [{kinds: [RELAYS], authors: [pubkey]}]

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

export const loadUsingOutbox = batcher(100, async (filterses: Filter[][]) => {
  const filters = unionFilters(flatten(filterses))
  const pubkeys = uniq(filters.flatMap(f => f.authors || []))

  await Promise.all(pubkeys.map(pubkey => loadRelayList(pubkey)))

  const relays = Router.get().FromPubkeys(pubkeys).policy(addMinimalFallbacks).getUrls()

  await load({filters, relays})

  return filterses.map(() => undefined)
})

export const makeOutboxLoader =
  (kind: number, filter: Filter = {}) =>
  async (pubkey: string, relayHints: string[] = []) => {
    const filters = [{...filter, kinds: [kind], authors: [pubkey]}]
    const relays = Router.get().FromRelays(relayHints).getUrls()

    await Promise.all([load({filters, relays}), loadUsingOutbox(filters)])
  }
