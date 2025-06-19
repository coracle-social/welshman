import {derived} from "svelte/store"
import {batcher} from "@welshman/lib"
import {INBOX_RELAYS, RELAYS, asDecryptedEvent, readList, getRelaysFromList} from "@welshman/util"
import {TrustedEvent, PublishedList, RelayMode} from "@welshman/util"
import {request} from "@welshman/net"
import {deriveEventsMapped, collection} from "@welshman/store"
import {Router} from "@welshman/router"
import {repository} from "./core.js"

export type OutboxLoaderRequest = {
  pubkey: string
  relays: string[]
  kind: number
}

export const loadUsingOutbox = batcher(200, (requests: OutboxLoaderRequest[]) => {
  const router = Router.get()
  const kinds = new Set<number>()
  const authors = new Set<string>()
  const scenarios = [router.Index()]

  for (const {pubkey, kind} of requests) {
    kinds.add(kind)
    authors.add(pubkey)
    scenarios.push(router.FromPubkey(pubkey))
  }

  const relays = router.merge(scenarios).getUrls()
  const filters = [{authors: Array.from(authors), kinds: Array.from(kinds)}]
  const promise = request({filters, relays, autoClose: true})

  return requests.map(async ({kind, pubkey, relays}) => {
    const promises = [promise]

    // If the caller explicitly provided relays, make sure we check them
    if (relays.length > 0) {
      const filters = [{authors: [pubkey], kinds: [kind]}]

      promises.push(request({filters, relays, autoClose: true}))
    }

    await Promise.all(promises)
  })
})

export const makeOutboxLoader = (kind: number) => (pubkey: string, relays: string[]) =>
  loadUsingOutbox({pubkey, relays, kind})

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

export const getPubkeyRelays = (pubkey: string, mode?: RelayMode) =>
  mode === RelayMode.Inbox
    ? getRelaysFromList(inboxRelaySelectionsByPubkey.get().get(pubkey))
    : getRelaysFromList(relaySelectionsByPubkey.get().get(pubkey), mode)

export const derivePubkeyRelays = (pubkey: string, mode?: RelayMode) =>
  mode === RelayMode.Inbox
    ? derived(inboxRelaySelectionsByPubkey, $m => getRelaysFromList($m.get(pubkey)))
    : derived(relaySelectionsByPubkey, $m => getRelaysFromList($m.get(pubkey), mode))

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
