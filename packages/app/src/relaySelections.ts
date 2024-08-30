import {RELAYS, getRelayTags, normalizeRelayUrl, type TrustedEvent} from '@welshman/util'
import {type SubscribeRequest} from "@welshman/net"
import {deriveEvents} from '@welshman/store'
import {load, repository} from './core'
import {collection} from './collection'

export const getReadRelayUrls = (event?: TrustedEvent): string[] =>
  getRelayTags(event?.tags || [])
    .filter((t: string[]) => !t[2] || t[2] === "read")
    .map((t: string[]) => normalizeRelayUrl(t[1]))

export const getWriteRelayUrls = (event?: TrustedEvent): string[] =>
  getRelayTags(event?.tags || [])
    .filter((t: string[]) => !t[2] || t[2] === "write")
    .map((t: string[]) => normalizeRelayUrl(t[1]))

export const relaySelections = deriveEvents(repository, {filters: [{kinds: [RELAYS]}]})

export const {
  indexStore: relaySelectionsByPubkey,
  deriveItem: deriveRelaySelections,
  loadItem: loadRelaySelections,
} = collection({
  name: "relaySelections",
  store: relaySelections,
  getKey: relaySelections => relaySelections.pubkey,
  load: (pubkey: string, relays: string[], request: Partial<SubscribeRequest> = {}) =>
    load({
      ...request,
      relays,
      filters: [{kinds: [RELAYS], authors: [pubkey]}],
    }),
})
