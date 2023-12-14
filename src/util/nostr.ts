import type {Event} from 'nostr-tools'
import normalizeUrl from "normalize-url"
import {verifyEvent, getEventHash, matchFilter as nostrToolsMatchFilter} from 'nostr-tools'
import {cached} from "./LRUCache"

// ===========================================================================
// General-purpose

export const now = () => Math.round(Date.now() / 1000)

export const last = <T>(xs: T[]) => xs[xs.length - 1]

export const identity = <T>(x: T) => x

export const flatten = <T>(xs: T[]) => xs.flatMap(identity)

export const uniq = <T>(xs: T[]) => Array.from(new Set(xs))

// ===========================================================================
// Relays

export const stripProto = (url: string) => url.replace(/.*:\/\//, "")

export const isShareableRelay = (url: string) =>
  Boolean(
    typeof url === 'string' &&
    // Is it actually a websocket url and has a dot
    url.match(/^wss?:\/\/.+\..+/) &&
    // Sometimes bugs cause multiple relays to get concatenated
    url.match(/:\/\//g)?.length === 1 &&
    // It shouldn't have any whitespace
    !url.match(/\s/) &&
    // It shouldn't have any url-encoded whitespace
    !url.match(/%/) &&
    // Is it secure
    url.match(/^wss:\/\/.+/) &&
    // Don't match stuff with a port number
    !url.slice(6).match(/:\d+/) &&
    // Don't match raw ip addresses
    !url.slice(6).match(/\d+\.\d+\.\d+\.\d+/) &&
    // Skip nostr.wine's virtual relays
    !url.slice(6).match(/\/npub/)
  )

export const normalizeRelayUrl = (url: string) => {
  // Use our library to normalize
  url = normalizeUrl(url, {stripHash: true, stripAuthentication: false})

  // Strip the protocol since only wss works
  url = stripProto(url)

  // Urls without pathnames are supposed to have a trailing slash
  if (!url.includes("/")) {
    url += "/"
  }

  return "wss://" + url
}


// ===========================================================================
// Nostr URIs

export const fromNostrURI = (s: string) => s.replace(/^[\w+]+:\/?\/?/, "")

export const toNostrURI = (s: string) => `nostr:${s}`

// ===========================================================================
// Events

export type CreateEventOpts = {
  content?: string
  tags?: string[][]
  created_at?: number
}

export const createEvent = (kind: number, {content = "", tags = [], created_at = now()}: CreateEventOpts) =>
  ({kind, content, tags, created_at})

export const hasValidSignature = cached<string, boolean, [Event]>({
  maxSize: 10000,
  getKey: ([e]: [Event]) => {
    try {
      return [getEventHash(e), e.sig].join(":")
    } catch (err) {
      return 'invalid'
    }
  },
  getValue: ([e]: [Event]) => {
    try {
      return verifyEvent(e)
    } catch (err) {
      return false
    }
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
