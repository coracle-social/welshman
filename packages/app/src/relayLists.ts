import {batcher} from "@welshman/lib"
import {RELAYS, Filter, asDecryptedEvent, readList, TrustedEvent} from "@welshman/util"
import {
  deriveItemsByKey,
  deriveItems,
  makeForceLoadItem,
  makeLoadItem,
  makeDeriveItem,
  getter,
} from "@welshman/store"
import {load, LoadOptions} from "@welshman/net"
import {Router} from "@welshman/router"
import {repository} from "./core.js"

export type LoadUsingOutboxOptions = Omit<LoadOptions, "relays">

export const loadUsingOutbox = batcher(200, (optionses: LoadUsingOutboxOptions[]) => {
  const pubkeys = optionses.flatMap(o => o.filters.flatMap(f => f.authors || []))
  const relays = Router.get().FromPubkeys(pubkeys).getUrls()

  return optionses.map(options => load({...options, relays}))
})

export const makeOutboxLoader =
  (kind: number, filter: Filter = {}) =>
  (pubkey: string, relays: string[]) => {
    const filters = [{...filter, authors: [pubkey], kinds: [kind]}]

    return Promise.all([load({relays, filters}), loadUsingOutbox({filters})])
  }

export const makeOutboxLoaderWithIndexers =
  (kind: number, filter: Filter = {}) =>
  (pubkey: string, relays: string[]) => {
    const filters = [{...filter, authors: [pubkey], kinds: [kind]}]

    return Promise.all([
      load({relays, filters}),
      loadUsingOutbox({filters}),
      load({relays: Router.get().Index().getUrls(), filters}),
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

export const forceLoadRelayList = makeForceLoadItem(
  makeOutboxLoaderWithIndexers(RELAYS),
  getRelayList,
)

export const loadRelayList = makeLoadItem(makeOutboxLoaderWithIndexers(RELAYS), getRelayList)

export const deriveRelayList = makeDeriveItem(relayListsByPubkey, loadRelayList)
