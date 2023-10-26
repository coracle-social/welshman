import type {Event} from 'nostr-tools'
import {verifySignature, getEventHash, matchFilter as nostrToolsMatchFilter} from 'nostr-tools'
import {cached} from "./LRUCache"

// ===========================================================================
// General-purpose

export const now = () => Math.round(Date.now() / 1000)

// ===========================================================================
// Relays

export const stripProto = (url: string) => url.replace(/.*:\/\//, "")

export const isShareableRelay = (url: string) =>
  // Is it actually a websocket url
  url.match(/^wss:\/\/.+/) &&
  // Sometimes bugs cause multiple relays to get concatenated
  url.match(/:\/\//g)?.length === 1 &&
  // It shouldn't have any whitespace
  !url.match(/\s/) &&
  // Don't match stuff with a port number
  !url.slice(6).match(/:\d+/) &&
  // Don't match raw ip addresses
  !url.slice(6).match(/\d+\.\d+\.\d+\.\d+/) &&
  // Skip nostr.wine's virtual relays
  !url.slice(6).match(/\/npub/)

export const normalizeRelayUrl = (url: string) => {
  // If it doesn't start with a compatible protocol, strip the proto and add wss
  if (!url.match(/^(wss|local):\/\/.+/)) {
    url = "wss://" + stripProto(url)
  }

  try {
    return new URL(url).href.replace(/\/+$/, "").toLowerCase()
  } catch (e) {
    return null
  }
}

// ===========================================================================
// Nostr URIs

export const fromNostrURI = (s: string) => s.replace(/^[\w+]+:\/?\/?/, "")

export const toNostrURI = (s: string) => `nostr:${s}`

// ===========================================================================
// Events

export const createEvent = (kind: number, {content = "", tags = [], created_at = now()}) =>
  ({kind, content, tags, created_at})

export const hasValidSignature = cached({
  maxSize: 10000,
  getKey: ([e]: any[]) => [getEventHash(e), e.sig].join(":"),
  getValue: ([e]: any[]) => {
    try {
      verifySignature(e)
    } catch (e) {
      return false
    }

    return true
  },
})

// ===========================================================================
// Filters

export type Filter = {
  ids?: string[]
  kinds?: number[]
  authors?: string[]
  since?: number
  until?: number
  limit?: number
  search?: string
  [key: `#${string}`]: string[]
}

export const matchFilter = (filter: Filter, event: Event) => {
  if (!nostrToolsMatchFilter(filter, event)) {
    return false
  }

  if (filter.search) {
    const content = event.content.toLowerCase()
    const terms = filter.search.toLowerCase().split(/\s+/g)

    for (const term of terms) {
      if (content.includes(term)) {
        return true
      }

      return false
    }
  }

  return true
}

export const matchFilters = (filters: Filter[], event: Event) => {
  for (const filter of filters) {
    if (matchFilter(filter, event)) {
      return true
    }
  }

  return false
}
