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
import type {TrustedEvent, PublishedList, List} from "@welshman/util"
import type {SubscribeRequestWithHandlers} from "@welshman/net"
import {deriveEventsMapped} from "@welshman/store"
import {repository} from "./core.js"
import {load} from "./subscribe.js"
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
  load: (pubkey: string, request: Partial<SubscribeRequestWithHandlers> = {}) =>
    load({...request, filters: [{kinds: [RELAYS], authors: [pubkey]}]}),
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
  load: (pubkey: string, request: Partial<SubscribeRequestWithHandlers> = {}) =>
    load({...request, filters: [{kinds: [INBOX_RELAYS], authors: [pubkey]}]}),
})
