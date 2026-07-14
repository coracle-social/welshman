import {add, inc, take, sortBy, shuffle, first, uniq} from "@welshman/lib"
import type {MaybeAsync} from "@welshman/lib"
import {isRelayUrl, isOnionUrl, isLocalUrl, normalizeRelayUrl} from "./Relay.js"

// A relay selection is a *declarative* description of which relays an operation
// wants — not a list of urls. It names sources ("the author's outbox", "this
// pubkey's inbox", "the relays this event was seen on") that can only be turned
// into concrete urls in a context where the necessary data is available (relay
// lists, the tracker, the network to load a referenced event). Domain code
// produces selections from an event; the app resolves them (see resolveSelections).

// A reference to an event we route relative to (e.g. to reach its author). Every
// field is optional and additive: a known `pubkey` lets us route directly — even
// for a non-replaceable event — without finding the event at all; `id` /
// `kind`+`pubkey`+`identifier` let the resolver look the event up (in a cache or,
// eventually, over the network) when the pubkey isn't already known; `relays` are
// hints for that lookup and a last-resort routing fallback.
export type EventRef = {
  id?: string
  pubkey?: string
  kind?: number
  identifier?: string
  relays?: string[]
}

export type RelayRoute =
  // The current user's inbox (read), outbox (write), or messaging relays — for
  // the events the user is publishing.
  | {type: "userInbox"}
  | {type: "userOutbox"}
  | {type: "userMessaging"}
  // A specific pubkey's inbox (read), outbox (write), or messaging relays.
  | {type: "pubkeyInbox"; pubkey: string}
  | {type: "pubkeyOutbox"; pubkey: string}
  | {type: "pubkeyMessaging"; pubkey: string}
  // The author of a referenced event — the resolver finds the event first.
  | {type: "eventInbox"; ref: EventRef}
  | {type: "eventOutbox"; ref: EventRef}
  // The relays a given event was found on.
  | {type: "seen"; ref: EventRef}
  // A literal relay url (e.g. a hint embedded in a tag, or a group relay).
  | {type: "relay"; url: string}
  // Relays that index profiles/relay-lists.
  | {type: "index"}
  // Relays configured for full-text search.
  | {type: "search"}

export type RelaySelection = {
  route: RelayRoute
  weight: number
}

// DSL constructors ----------------------------------------------------------

const sel = (route: RelayRoute, weight = 1): RelaySelection => ({route, weight})

export const inbox = (pubkey: string, weight = 1) => sel({type: "pubkeyInbox", pubkey}, weight)

export const outbox = (pubkey: string, weight = 1) => sel({type: "pubkeyOutbox", pubkey}, weight)

export const messaging = (pubkey: string, weight = 1) =>
  sel({type: "pubkeyMessaging", pubkey}, weight)

export const userInbox = (weight = 1) => sel({type: "userInbox"}, weight)

export const userOutbox = (weight = 1) => sel({type: "userOutbox"}, weight)

export const userMessaging = (weight = 1) => sel({type: "userMessaging"}, weight)

export const eventInbox = (ref: EventRef, weight = 1) => sel({type: "eventInbox", ref}, weight)

export const eventOutbox = (ref: EventRef, weight = 1) => sel({type: "eventOutbox", ref}, weight)

// Relays the given event was found on (its tracker relays plus any ref hints).
export const seen = (ref: EventRef, weight = 1) => sel({type: "seen", ref}, weight)

export const relay = (url: string, weight = 1) => sel({type: "relay", url}, weight)

export const relays = (urls: string[], weight = 1) => urls.map(url => relay(url, weight))

// Inbox selections for a set of pubkeys (mentions/recipients).
export const inboxes = (pubkeys: string[], weight = 1) =>
  uniq(pubkeys).map(pubkey => inbox(pubkey, weight))

export const indexers = (weight = 1) => sel({type: "index"}, weight)

export const searchRelays = (weight = 1) => sel({type: "search"}, weight)

// Concrete, resolved weighted relay set -------------------------------------

export type Selection = {
  weight: number
  relays: string[]
}

export const makeSelection = (relays: string[], weight = 1): Selection => ({
  relays: relays.filter(isRelayUrl).map(normalizeRelayUrl),
  weight,
})

// Fallback policies ---------------------------------------------------------

export type FallbackPolicy = (count: number, limit: number) => number

export const addNoFallbacks = (count: number, limit: number) => 0

export const addMinimalFallbacks = (count: number, limit: number) => (count > 0 ? 0 : 1)

export const addMaximalFallbacks = (count: number, limit: number) => limit - count

// Scenario: score & pick concrete relays from weighted selections -----------
//
// Ported from the old `@welshman/router` RouterScenario, but decoupled from the
// Router class: relay quality and default relays are injected via options rather
// than pulled off a Router instance, so this is pure and reusable.

export type RelayScenarioOptions = {
  policy?: FallbackPolicy
  limit?: number
  allowLocal?: boolean
  allowOnion?: boolean
  allowInsecure?: boolean
  getRelayQuality?: (url: string) => number
  getDefaultRelays?: () => string[]
}

export class RelayScenario {
  constructor(
    readonly selections: Selection[],
    readonly options: RelayScenarioOptions = {},
  ) {}

  clone = (options: RelayScenarioOptions) =>
    new RelayScenario(this.selections, {...this.options, ...options})

  limit = (limit: number) => this.clone({limit})

  policy = (policy: FallbackPolicy) => this.clone({policy})

  allowLocal = (allowLocal: boolean) => this.clone({allowLocal})

  allowOnion = (allowOnion: boolean) => this.clone({allowOnion})

  allowInsecure = (allowInsecure: boolean) => this.clone({allowInsecure})

  getLimit = () => this.options.limit || 3

  getPolicy = () => this.options.policy || addNoFallbacks

  getUrls = () => {
    const limit = this.getLimit()
    const fallbackPolicy = this.getPolicy()
    const relayWeights = new Map<string, number>()
    const {getRelayQuality, getDefaultRelays, allowOnion, allowLocal, allowInsecure} = this.options

    for (const {weight, relays} of this.selections) {
      for (const relay of relays) {
        if (!isRelayUrl(relay)) continue
        if (!allowOnion && isOnionUrl(relay)) continue
        if (!allowLocal && isLocalUrl(relay)) continue
        if (!allowInsecure && relay.startsWith("ws://") && !isOnionUrl(relay)) continue

        relayWeights.set(relay, add(weight, relayWeights.get(relay)))
      }
    }

    const scoreRelay = (relay: string) => {
      const weight = relayWeights.get(relay)!
      const quality = getRelayQuality ? getRelayQuality(relay) : 1

      // Log the weight, since it's a straight count which ends up over-weighting
      // hubs. Also add some random noise so that we'll occasionally pick lower
      // quality/less popular relays.
      return -(quality * inc(Math.log(weight)) * Math.random())
    }

    const relays = take(
      limit,
      sortBy(scoreRelay, Array.from(relayWeights.keys()).filter(scoreRelay)),
    )

    const fallbacksNeeded = fallbackPolicy(relays.length, limit)
    const allFallbackRelays: string[] = getDefaultRelays?.() || []
    const fallbackRelays = shuffle(allFallbackRelays).slice(0, fallbacksNeeded)

    for (const fallbackRelay of fallbackRelays) {
      relays.push(fallbackRelay)
    }

    return relays
  }

  getUrl = () => first(this.getUrls())
}

// Resolver framework --------------------------------------------------------
//
// A `Resolver` provides a convenient interface to get router scenarios or relay
// based on a single route resolver function, bound options, and relay selections.

export type ResolveRoute = (route: RelayRoute) => MaybeAsync<string[]>

export class Resolver {
  constructor(
    readonly routeResolver: ResolveRoute,
    readonly options: RelayScenarioOptions = {},
  ) {}

  async scenario(selections: RelaySelection[]) {
    const resolved = await Promise.all(
      selections.map(async ({route, weight}) =>
        makeSelection(await this.routeResolver(route), weight),
      ),
    )

    return new RelayScenario(resolved, this.options)
  }

  async relays(selections: RelaySelection[]) {
    return (await this.scenario(selections)).getUrls()
  }

  async relay(selections: RelaySelection[]) {
    return (await this.scenario(selections)).getUrl()
  }
}
