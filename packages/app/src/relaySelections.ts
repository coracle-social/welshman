import {uniq} from "@welshman/lib"
import {
  INBOX_RELAYS,
  RELAYS,
  normalizeRelayUrl,
  asDecryptedEvent,
  readList,
  getListTags,
  getRelayTags,
  getRelayTagValues,
} from "@welshman/util"
import {TrustedEvent, Filter, PublishedList, List} from "@welshman/util"
import {load, MultiRequestOptions} from "@welshman/net"
import {deriveEventsMapped} from "@welshman/store"
import {repository} from "./core.js"
import {Router, addNoFallbacks} from "./router.js"
import {collection} from "./collection.js"

export const getRelayUrls = (list?: List): string[] =>
  uniq(getRelayTagValues(getListTags(list)).map(normalizeRelayUrl))

export const getReadRelayUrls = (list?: List): string[] =>
  uniq(
    getRelayTags(getListTags(list))
      .filter((t: string[]) => !t[2] || t[2] === "read")
      .map((t: string[]) => normalizeRelayUrl(t[1])),
  )

export const getWriteRelayUrls = (list?: List): string[] =>
  uniq(
    getRelayTags(getListTags(list))
      .filter((t: string[]) => !t[2] || t[2] === "write")
      .map((t: string[]) => normalizeRelayUrl(t[1])),
  )

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
  load: async (pubkey: string, relays: string[]) => {
    const router = Router.get()

    await load({
      relays: router.merge([router.Index(), router.FromRelays(relays), router.FromPubkey(pubkey)]).getUrls(),
      filters: [{kinds: [RELAYS], authors: [pubkey]}],
    })
  },
})

export const loadWithAsapMetaRelayUrls = <T>(pubkey: string, relays: string[], filters: Filter[]) => {
  const router = Router.get()

  return new Promise(resolve => {
    let resolved = 0

    const onLoad = (events: TrustedEvent[]) => {
      if (++resolved === 2 || events.length > 0) {
        resolve(events)
      }
    }

    load({filters, relays: router.merge([router.Index(), router.FromRelays(relays)]).getUrls()})
      .then(onLoad)

    loadRelaySelections(pubkey, relays)
      .then(() => load({filters, relays: router.FromPubkey(pubkey).getUrls()}))
      .then(onLoad)
  })
}

export const inboxRelaySelections = deriveEventsMapped<PublishedList>(repository, {
  filters: [{kinds: [INBOX_RELAYS]}],
  itemToEvent: item => item.event,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
})

export const {
  indexStore: inboxRelaySelectionsByPubkey,
  deriveItem: deriveInboxRelaySelections,
  loadItem: loadInboxRelaySelections,
} = collection({
  name: "inboxRelaySelections",
  store: inboxRelaySelections,
  getKey: inboxRelaySelections => inboxRelaySelections.event.pubkey,
  load: (pubkey: string, relays: string[]) =>
    loadWithAsapMetaRelayUrls(pubkey, relays, [{kinds: [INBOX_RELAYS], authors: [pubkey]}])
})
