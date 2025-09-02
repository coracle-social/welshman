import {batcher} from "@welshman/lib"
import {RELAYS, Filter, asDecryptedEvent, readList, TrustedEvent, PublishedList} from "@welshman/util"
import {deriveEventsMapped, collection} from "@welshman/store"
import {load, LoadOptions} from "@welshman/net"
import {Router} from "@welshman/router"
import {repository} from "./core.js"

export type LoadUsingOutboxOptions = Omit<LoadOptions, "relays">

export const loadUsingOutbox = batcher(200, (optionses: LoadUsingOutboxOptions[]) => {
  const pubkeys = optionses.flatMap(o => o.filters.flatMap(f => f.authors || []))
  const relays = Router.get().FromPubkeys(pubkeys).getUrls()

  return optionses.map(options => load({...options, relays}))
})

export const makeOutboxLoader = (kind: number, filter: Filter = {}) => (pubkey: string, relays: string[]) => {
  const filters = [{...filter, authors: [pubkey], kinds: [kind]}]

  return Promise.all([load({relays, filters}), loadUsingOutbox({filters})])
}

export const makeOutboxLoaderWithIndexers =
  (kind: number, filter: Filter = {}) => (pubkey: string, relays: string[]) => {
    const filters = [{...filter, authors: [pubkey], kinds: [kind]}]

    return Promise.all([
      load({relays, filters}),
      loadUsingOutbox({filters}),
      load({relays: Router.get().Index().getUrls(), filters}),
    ])
  }

export const relaySelections = deriveEventsMapped<PublishedList>(repository, {
  filters: [{kinds: [RELAYS]}],
  itemToEvent: item => item.event,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
})

export const {
  indexStore: relaySelectionsByPubkey,
  deriveItem: deriveRelaySelections,
  loadItem: loadRelaySelections,
} = collection({
  name: "relaySelections",
  store: relaySelections,
  getKey: relaySelections => relaySelections.event.pubkey,
  load: makeOutboxLoaderWithIndexers(RELAYS),
})
