import {uniq, batcher, always} from "@welshman/lib"
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
import {request, load} from "@welshman/net"
import {deriveEventsMapped} from "@welshman/store"
import {repository} from "./core.js"
import {Router} from "./router.js"
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


export type OutboxLoaderRequest = {
  pubkey: string
  relays: string[]
  kind: number
}

export const loadUsingOutbox = batcher(200, (requests: OutboxLoaderRequest[]) => {
  const router = Router.get()
  const authors: string[] = []
  const scenarios = [router.Index()]
  const kinds = new Set<number>()

  for (const {pubkey, relays, kind} of requests) {
    kinds.add(kind)
    authors.push(pubkey)
    scenarios.push(router.FromPubkey(pubkey), router.FromRelays(relays))
  }

  const relays = router.merge(scenarios).getUrls()
  const filters = [{authors, kinds: Array.from(kinds)}]
  const promise = request({filters, relays, autoClose: true})

  return requests.map(always(promise))
})

export const makeOutboxLoader = (kind: number) =>
  (pubkey: string, relays: string[]) => loadUsingOutbox({pubkey, relays, kind})

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
  load: makeOutboxLoader(RELAYS),
})

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
  load: makeOutboxLoader(INBOX_RELAYS),
})
