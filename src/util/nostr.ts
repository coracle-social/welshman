import type {Event} from 'nostr-tools'
import normalizeUrl from "normalize-url"
import {verifySignature, getEventHash, matchFilter as nostrToolsMatchFilter} from 'nostr-tools'
import {cached} from "./LRUCache"

// ===========================================================================
// General-purpose

export const now = () => Math.round(Date.now() / 1000)

export const last = <T>(xs: T[]) => xs[xs.length - 1]

export const identity = <T>(x: T) => x

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
  getKey: ([e]: [Event]) => [getEventHash(e), e.sig].join(":"),
  getValue: ([e]: [Event]) => {
    try {
      verifySignature(e)
    } catch (e) {
      return false
    }

    return true
  },
})

// ==========================================================================
// Tags

export class Fluent<T> {
  xs: any[]

  constructor(xs: T[]) {
    this.xs = xs.filter(identity)
  }

  as = <U>(f: (xs: T[]) => U) => f(this.xs)

  all = () => this.xs

  count = () => this.xs.length

  exists = () => this.xs.length > 0

  first = () => this.xs[0]

  nth = (i: number) => this.xs[i]

  last = () => last(this.xs)

  flat = () => new Fluent(this.xs.flatMap(identity))

  uniq = () => new Fluent(Array.from(new Set(this.xs)))

  drop = (n: number) => new Fluent(this.xs.map(t => t.slice(n)))

  take = (n: number) => new Fluent(this.xs.map(t => t.slice(0, n)))

  map = <U>(f: (t: T) => U) => new Fluent(this.xs.map(f))

  flatMap = <U>(f: (t: T) => U) => new Fluent(this.xs.flatMap(f))

  pluck = (k: number | string) => new Fluent(this.xs.map(x => x[k]))

  filter = (f: (t: T) => boolean) => new Fluent(this.xs.filter(f))

  reject = (f: (t: T) => boolean) => new Fluent(this.xs.filter(t => !f(t)))

  any = (f: (t: T) => boolean) => this.filter(f).exists()

  find = (f: (t: T) => boolean) => this.xs.find(f)

  has = (x: any) => this.xs.includes(x)
}

export class Tags extends Fluent<string[]> {
  static from (e: Event | Event[]) {
    const events = Array.isArray(e) ? e : [e]

    return new Tags(events.flatMap(e => e.tags))
  }

  nthEq = (i: number, v: string) => new Tags(this.xs.filter(t => t[i] === v))

  values = (k?: string) => this.filter(t => !k || t[0] === k).pluck(1)

  type(t: string | string[]) {
    const types = Array.isArray(t) ? t : [t]

    return new Tags(this.xs.filter(t => types.includes(t[0])))
  }

  mark(m: string | string[]) {
    const marks = Array.isArray(m) ? m : [m]

    return new Tags(this.xs.filter(t => marks.includes(last(t))))
  }

  relays = () => this.flat().filter(isShareableRelay).uniq()

  topics = () => this.type("t").values().map((t: string) => t.replace(/^#/, ""))

  pubkeys = () => this.type("p").values()

  urls = () => this.type("r").values()

  getValue = (k?: string) => this.values(k).first()

  getDict() {
    const meta: Record<string, string> = {}

    for (const [k, v] of this.xs) {
      if (!meta[k]) {
        meta[k] = v
      }
    }

    return meta
  }

  getAncestorsLegacy() {
    // Legacy only supports e tags. Normalize their length to 3
    const eTags = this.type("e").map(t => {
      while (t.length < 3) {
        t.push("")
      }

      return t.slice(0, 3)
    })

    return {
      roots: eTags.count() > 1 ? new Tags([eTags.first()]) : new Tags([]),
      replies: new Tags([eTags.last()]),
      mentions: new Tags(eTags.all().slice(1, -1)),
    }
  }

  getAncestors(type = null) {
    // If we have a mark, we're not using the legacy format
    if (!this.any(t => t.length === 4 && ["reply", "root", "mention"].includes(last(t)))) {
      return this.getAncestorsLegacy()
    }

    const tags = new Tags(this.type(type || ["a", "e"]).all().filter(t => !String(t[1]).startsWith('34550:')))

    return {
      roots: new Tags(tags.mark('root').take(3).all()),
      replies: new Tags(tags.mark('reply').take(3).all()),
      mentions: new Tags(tags.mark('mention').take(3).all()),
    }
  }

  roots = (type = null) => this.getAncestors(type).roots

  replies = (type = null) => this.getAncestors(type).replies

  communities = () => this.type("a").values().filter(a => a.startsWith('34550:'))

  getReply = (type = null) => this.replies(type).values().first()

  getRoot = (type = null) => this.roots(type).values().first()

  getReplyHints = (type = null) => this.replies(type).relays().all()

  getRootHints = (type = null) => this.roots(type).relays().all()
}

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
