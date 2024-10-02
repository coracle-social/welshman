import {INBOX_RELAYS, RELAYS, getRelayTags, normalizeRelayUrl, type TrustedEvent} from '@welshman/util'
import {type SubscribeRequestWithHandlers} from "@welshman/net"
import {deriveEvents, withGetter} from '@welshman/store'
import {load, repository} from './core'
import {collection} from './collection'

export const getRelayUrls = (event?: TrustedEvent): string[] =>
  getRelayTags(event?.tags || [])
    .map((t: string[]) => normalizeRelayUrl(t[1]))

export const getReadRelayUrls = (event?: TrustedEvent): string[] =>
  getRelayTags(event?.tags || [])
    .filter((t: string[]) => !t[2] || t[2] === "read")
    .map((t: string[]) => normalizeRelayUrl(t[1]))

export const getWriteRelayUrls = (event?: TrustedEvent): string[] =>
  getRelayTags(event?.tags || [])
    .filter((t: string[]) => !t[2] || t[2] === "write")
    .map((t: string[]) => normalizeRelayUrl(t[1]))

export const relaySelections = withGetter(deriveEvents(repository, {filters: [{kinds: [RELAYS]}]}))

export const {
  indexStore: relaySelectionsByPubkey,
  deriveItem: deriveRelaySelections,
  loadItem: loadRelaySelections,
} = collection({
  name: "relaySelections",
  store: relaySelections,
  getKey: relaySelections => relaySelections.pubkey,
  load: (pubkey: string, request: Partial<SubscribeRequestWithHandlers> = {}) =>
    load({...request, filters: [{kinds: [RELAYS], authors: [pubkey]}]}),
})

export const inboxRelaySelections = withGetter(deriveEvents(repository, {filters: [{kinds: [INBOX_RELAYS]}]}))

export const {
  indexStore: inboxRelaySelectionsByPubkey,
  deriveItem: deriveInboxRelaySelections,
  loadItem: loadInboxRelaySelections,
} = collection({
  name: "inboxRelaySelections",
  store: inboxRelaySelections,
  getKey: inboxRelaySelections => inboxRelaySelections.pubkey,
  load: (pubkey: string, request: Partial<SubscribeRequestWithHandlers> = {}) =>
    load({...request, filters: [{kinds: [INBOX_RELAYS], authors: [pubkey]}]}),
})
