import {nth, uniq, first, sortBy, shuffle, inc, add, take} from "@welshman/lib"
import {
  isRelayUrl,
  isOnionUrl,
  isLocalUrl,
  isShareableRelayUrl,
  getPubkeyTagValues,
  normalizeRelayUrl,
  getAncestorTags,
  getPubkeyTags,
  RelayMode,
} from "@welshman/util"
import type {TrustedEvent, Filter} from "@welshman/util"
import type {ClientContext} from "./client.js"

export type RelaysAndFilters = {
  relays: string[]
  filters: Filter[]
}

export type RouterOptions = {
  /**
   * Retrieves default relays, for use as fallbacks when no other relays can be selected.
   * @returns An array of relay URLs as strings.
   */
  getDefaultRelays?: () => string[]

  /**
   * Retrieves relays that index profiles and relay selections.
   * @returns An array of relay URLs as strings.
   */
  getIndexerRelays?: () => string[]

  /**
   * Retrieves relays likely to support NIP-50 search.
   * @returns An array of relay URLs as strings.
   */
  getSearchRelays?: () => string[]

  /**
   * Retrieves the limit setting, which is the maximum number of relays that should be
   * returned from getUrls and getSelections.
   * @returns The limit setting as a number.
   */
  getLimit?: () => number

  /**
   * Retrieves a pubkey's relays for a given mode. Injected (rather than read off
   * a relay-list module directly) so the router has no dependency on its sibling
   * data modules. See `createApp`.
   * @returns An array of relay URLs as strings.
   */
  getRelaysForPubkey?: (pubkey: string, mode?: RelayMode) => string[]

  /**
   * Scores a relay url for ranking (higher is better). Injected so the router
   * doesn't depend on the relay-stats module.
   * @returns A quality score, typically between 0 and 1.
   */
  getRelayQuality?: (url: string) => number
}

export type Selection = {
  weight: number
  relays: string[]
}

export const makeSelection = (relays: string[], weight = 1): Selection => ({
  relays: relays.filter(isRelayUrl).map(normalizeRelayUrl),
  weight,
})

// Fallback policies

export type FallbackPolicy = (count: number, limit: number) => number

export const addNoFallbacks = (count: number, limit: number) => 0

export const addMinimalFallbacks = (count: number, limit: number) => (count > 0 ? 0 : 1)

export const addMaximalFallbacks = (count: number, limit: number) => limit - count

// Router class

export class Router {
  constructor(
    readonly ctx: ClientContext,
    readonly options: RouterOptions,
  ) {}

  // Utilities derived from options

  getRelaysForPubkey = (pubkey: string, mode?: RelayMode) =>
    this.options.getRelaysForPubkey?.(pubkey, mode) || []

  getRelaysForPubkeys = (pubkeys: string[], mode?: RelayMode) =>
    pubkeys.map(pubkey => this.getRelaysForPubkey(pubkey, mode))

  getRelaysForUser = (mode?: RelayMode) => {
    const pubkey = this.ctx.user?.pubkey

    return pubkey ? this.getRelaysForPubkey(pubkey, mode) : []
  }

  // Utilities for creating scenarios

  scenario = (selections: Selection[]) => new RouterScenario(this, selections)

  merge = (scenarios: RouterScenario[]) =>
    this.scenario(scenarios.flatMap((scenario: RouterScenario) => scenario.selections))

  // Routing scenarios

  FromRelays = (relays: string[]) => this.scenario([makeSelection(relays)])

  Search = () => this.FromRelays(this.options.getSearchRelays?.() || [])

  Index = () => this.FromRelays(this.options.getIndexerRelays?.() || [])

  Default = () => this.FromRelays(this.options.getDefaultRelays?.() || [])

  ForUser = () => this.FromRelays(this.getRelaysForUser(RelayMode.Read))

  FromUser = () => this.FromRelays(this.getRelaysForUser(RelayMode.Write))

  MessagesForUser = () => this.FromRelays(this.getRelaysForUser(RelayMode.Messaging))

  ForPubkey = (pubkey: string) => this.FromRelays(this.getRelaysForPubkey(pubkey, RelayMode.Read))

  FromPubkey = (pubkey: string) => this.FromRelays(this.getRelaysForPubkey(pubkey, RelayMode.Write))

  MessagesForPubkey = (pubkey: string) =>
    this.FromRelays(this.getRelaysForPubkey(pubkey, RelayMode.Messaging))

  ForPubkeys = (pubkeys: string[]) => this.merge(pubkeys.map(pubkey => this.ForPubkey(pubkey)))

  FromPubkeys = (pubkeys: string[]) => this.merge(pubkeys.map(pubkey => this.FromPubkey(pubkey)))

  MessagesForPubkeys = (pubkeys: string[]) =>
    this.merge(pubkeys.map(pubkey => this.MessagesForPubkey(pubkey)))

  Event = (event: TrustedEvent) =>
    this.FromRelays(this.getRelaysForPubkey(event.pubkey, RelayMode.Write))

  Replies = (event: TrustedEvent) =>
    this.FromRelays(this.getRelaysForPubkey(event.pubkey, RelayMode.Read))

  Quote = (event: TrustedEvent, value: string, relays: string[] = []) => {
    const tag = event.tags.find(t => t[1] === value)
    const scenarios = [
      this.FromRelays(relays),
      this.ForPubkey(event.pubkey),
      this.FromPubkey(event.pubkey),
    ]

    if (tag?.[2] && isShareableRelayUrl(tag[2])) {
      scenarios.push(this.FromRelays([tag[2]]))
    }

    if (tag?.[3]?.length === 64) {
      scenarios.push(this.FromPubkeys([tag[3]]))
    }

    return this.merge(scenarios)
  }

  EventParents = (event: TrustedEvent) => {
    const {replies} = getAncestorTags(event)
    const mentions = getPubkeyTags(event.tags)
    const authors = replies.map(nth(3)).filter(p => p?.length === 64)
    const others = mentions.map(nth(1)).filter(p => p?.length === 64)
    const relays = uniq([...replies, ...mentions].map(nth(2)).filter(r => r && isRelayUrl(r)))

    return this.merge([
      this.FromPubkeys(authors).weight(10),
      this.FromPubkeys(others),
      this.FromRelays(relays),
    ])
  }

  EventRoots = (event: TrustedEvent) => {
    const {roots} = getAncestorTags(event)
    const mentions = getPubkeyTags(event.tags)
    const authors = roots.map(nth(3)).filter(p => p?.length === 64)
    const others = mentions.map(nth(1)).filter(p => p?.length === 64)
    const relays = uniq([...roots, ...mentions].map(nth(2)).filter(r => r && isRelayUrl(r)))

    return this.merge([
      this.FromPubkeys(authors).weight(10),
      this.FromPubkeys(others),
      this.FromRelays(relays),
    ])
  }

  PublishEvent = (event: TrustedEvent) => {
    const pubkeys = getPubkeyTagValues(event.tags)
    const scenarios = [
      this.FromPubkey(event.pubkey),
      ...pubkeys.map(pubkey => this.ForPubkey(pubkey).weight(0.5)),
    ]

    // Override the limit to ensure deliverability even when lots of pubkeys are mentioned
    return this.merge(scenarios).limit(30)
  }
}

// Router Scenario

export type RouterScenarioOptions = {
  policy?: FallbackPolicy
  limit?: number
  allowLocal?: boolean
  allowOnion?: boolean
  allowInsecure?: boolean
}

export class RouterScenario {
  constructor(
    readonly router: Router,
    readonly selections: Selection[],
    readonly options: RouterScenarioOptions = {},
  ) {}

  clone = (options: RouterScenarioOptions) =>
    new RouterScenario(this.router, this.selections, {...this.options, ...options})

  filter = (f: (selection: Selection) => boolean) =>
    new RouterScenario(
      this.router,
      this.selections.filter(selection => f(selection)),
      this.options,
    )

  update = (f: (selection: Selection) => Selection) =>
    new RouterScenario(
      this.router,
      this.selections.map(selection => f(selection)),
      this.options,
    )

  policy = (policy: FallbackPolicy) => this.clone({policy})

  limit = (limit: number) => this.clone({limit})

  allowLocal = (allowLocal: boolean) => this.clone({allowLocal})

  allowOnion = (allowOnion: boolean) => this.clone({allowOnion})

  allowInsecure = (allowInsecure: boolean) => this.clone({allowInsecure})

  weight = (scale: number) =>
    this.update(selection => ({...selection, weight: selection.weight * scale}))

  getPolicy = () => this.options.policy || addNoFallbacks

  getLimit = () => this.options.limit || this.router.options.getLimit?.() || 3

  getUrls = () => {
    const limit = this.getLimit()
    const fallbackPolicy = this.getPolicy()
    const relayWeights = new Map<string, number>()
    const {allowOnion, allowLocal, allowInsecure} = this.options

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
      const quality = this.router.options.getRelayQuality?.(relay) ?? 1

      // Log the weight, since it's a straight count which ends up over-weighting hubs.
      // Also add some random noise so that we'll occasionally pick lower quality/less
      // popular relays.
      return -(quality * inc(Math.log(weight)) * Math.random())
    }

    const relays = take(
      limit,
      sortBy(scoreRelay, Array.from(relayWeights.keys()).filter(scoreRelay)),
    )

    const fallbacksNeeded = fallbackPolicy(relays.length, limit)
    const allFallbackRelays: string[] = this.router.options.getDefaultRelays?.() || []
    const fallbackRelays = shuffle(allFallbackRelays).slice(0, fallbacksNeeded)

    for (const fallbackRelay of fallbackRelays) {
      relays.push(fallbackRelay)
    }

    return relays
  }

  getUrl = () => first(this.getUrls())
}
