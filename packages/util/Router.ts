import {first, splitAt, identity, sortBy, uniq, shuffle, pushToMapKey} from '@welshman/lib'
import {Tags, Tag} from '@welshman/util'
import type {TrustedEvent} from './Events'
import {getAddress, isReplaceable} from './Events'
import {isShareableRelayUrl} from './Relay'
import {addressFromEvent, decodeAddress, isCommunityAddress, isGroupAddress} from './Address'

export enum RelayMode {
  Read = "read",
  Write = "write",
}

export type RouterOptions = {
  /**
   * Retrieves the user's public key.
   * @returns The user's public key as a string, or null if not available.
   */
  getUserPubkey?: () => string | null

  /**
   * Retrieves group relays for the specified community.
   * @param address - The address to retrieve group relays for.
   * @returns An array of group relay URLs as strings.
   */
  getGroupRelays?: (address: string) => string[]

  /**
   * Retrieves relays for the specified community.
   * @param address - The address to retrieve community relays for.
   * @returns An array of community relay URLs as strings.
   */
  getCommunityRelays?: (address: string) => string[]

  /**
   * Retrieves relays for the specified public key and mode.
   * @param pubkey - The public key to retrieve relays for.
   * @param mode - The relay mode (optional).
   * @returns An array of relay URLs as strings.
   */
  getPubkeyRelays?: (pubkey: string, mode?: RelayMode) => string[]

  /**
   * Retrieves fallback relays, for use when no other relays can be selected.
   * @returns An array of relay URLs as strings.
   */
  getFallbackRelays: () => string[]

  /**
   * Retrieves relays likely to return results for kind 0, 3, and 10002.
   * @returns An array of relay URLs as strings.
   */
  getIndexerRelays?: () => string[]

  /**
   * Retrieves relays likely to support NIP-50 search.
   * @returns An array of relay URLs as strings.
   */
  getSearchRelays?: () => string[]

  /**
   * Retrieves the quality of the specified relay.
   * @param url - The URL of the relay to retrieve quality for.
   * @returns The quality of the relay as a number between 0 and 1 inclusive.
   */
  getRelayQuality?: (url: string) => number

  /**
   * Retrieves the redundancy setting, which is how many relays to use per selection value.
   * @returns The redundancy setting as a number.
   */
  getRedundancy?: () => number

  /**
   * Retrieves the limit setting, which is the maximum number of relays that should be
   * returned from getUrls and getSelections.
   * @returns The limit setting as a number.
   */
  getLimit?: () => number
}

export type ValuesByRelay = Map<string, string[]>

export type RelayValues = {
  relay: string
  values: string[]
}

export type ValueRelays = {
  value: string
  relays: string[]
}

export type FallbackPolicy = (count: number, limit: number) => number

export class Router {
  constructor(readonly options: RouterOptions) {}

  // Utilities derived from options

  getPubkeySelection = (pubkey: string, mode?: RelayMode) =>
    this.selection(pubkey, this.options.getPubkeyRelays?.(pubkey, mode) || [])

  getPubkeySelections = (pubkeys: string[], mode?: RelayMode) =>
    pubkeys.map(pubkey => this.getPubkeySelection(pubkey, mode))

  getUserSelections = (mode?: RelayMode) =>
    this.getPubkeySelections([this.options.getUserPubkey?.()].filter(identity) as string[], mode)

  getContextSelections = (tags: Tags) => {
    return [
      ...tags.communities().mapTo(t => this.selection(t.value(), this.options.getCommunityRelays?.(t.value()) || [])).valueOf(),
      ...tags.groups().mapTo(t => this.selection(t.value(), this.options.getGroupRelays?.(t.value()) || [])).valueOf(),
    ]
  }

  // Utilities for creating ValueRelays

  selection = (value: string, relays: Iterable<string>) => ({value, relays: Array.from(relays)})

  selections = (values: string[], relays: string[]) =>
    values.map(value => this.selection(value, relays))

  forceValue = (value: string, selections: ValueRelays[]) =>
    selections.map(({relays}) => this.selection(value, relays))

  // Utilities for processing hints

  relaySelectionsFromMap = (valuesByRelay: ValuesByRelay) =>
    sortBy(
      ({values}) => -values.length,
      Array.from(valuesByRelay)
        .map(([relay, values]: [string, string[]]) => ({relay, values: uniq(values)}))
    )

  scoreRelaySelection = ({values, relay}: RelayValues) =>
    values.length * (this.options.getRelayQuality?.(relay) || 1)

  sortRelaySelections = (relaySelections: RelayValues[]) => {
    const scores = new Map<string, number>()
    const getScore = (relayValues: RelayValues) => -(scores.get(relayValues.relay) || 0)

    for (const relayValues of relaySelections) {
      scores.set(relayValues.relay, this.scoreRelaySelection(relayValues))
    }

    return sortBy(getScore, relaySelections.filter(getScore))
  }

  // Utilities for creating scenarios

  scenario = (selections: ValueRelays[]) => new RouterScenario(this, selections)

  merge = (scenarios: RouterScenario[]) =>
    this.scenario(scenarios.flatMap((scenario: RouterScenario) => scenario.selections))

  product = (values: string[], relays: string[]) =>
    this.scenario(this.selections(values, relays))

  fromRelays = (relays: string[]) => this.scenario([this.selection("", relays)])

  // Routing scenarios

  User = () => this.scenario(this.getUserSelections())

  ReadRelays = () => this.scenario(this.getUserSelections(RelayMode.Read))

  WriteRelays = () => this.scenario(this.getUserSelections(RelayMode.Write))

  Messages = (pubkeys: string[]) =>
    this.scenario([
      ...this.getUserSelections(),
      ...this.getPubkeySelections(pubkeys),
    ])

  PublishMessage = (pubkey: string) =>
    this.scenario([
      ...this.getUserSelections(RelayMode.Write),
      this.getPubkeySelection(pubkey, RelayMode.Read),
    ]).policy(this.addMinimalFallbacks)

  Event = (event: TrustedEvent) =>
    this.scenario(this.forceValue(event.id, [
      this.getPubkeySelection(event.pubkey, RelayMode.Write),
      ...this.getContextSelections(Tags.fromEvent(event).context()),
    ]))

  EventChildren = (event: TrustedEvent) =>
    this.scenario(this.forceValue(event.id, [
      this.getPubkeySelection(event.pubkey, RelayMode.Read),
      ...this.getContextSelections(Tags.fromEvent(event).context()),
    ]))

  EventAncestors = (event: TrustedEvent, type: "mentions" | "replies" | "roots") => {
    const tags = Tags.fromEvent(event)
    const ancestors = tags.ancestors()[type]
    const pubkeys = tags.whereKey("p").values().valueOf()
    const communities = tags.communities().values().valueOf()
    const groups = tags.groups().values().valueOf()
    const relays = uniq([
      ...this.options.getPubkeyRelays?.(event.pubkey, RelayMode.Read) || [],
      ...pubkeys.flatMap((k: string) => this.options.getPubkeyRelays?.(k, RelayMode.Write) || []),
      ...communities.flatMap((a: string) => this.options.getCommunityRelays?.(a) || []),
      ...groups.flatMap((a: string) => this.options.getGroupRelays?.(a) || []),
      ...ancestors.relays().valueOf(),
    ])

    return this.product(ancestors.values().valueOf(), relays)
  }

  EventMentions = (event: TrustedEvent) => this.EventAncestors(event, "mentions")

  EventParents = (event: TrustedEvent) => this.EventAncestors(event, "replies")

  EventRoots = (event: TrustedEvent) => this.EventAncestors(event, "roots")

  PublishEvent = (event: TrustedEvent) => {
    const tags = Tags.fromEvent(event)
    const mentions = tags.values("p").valueOf()

    // If we're publishing to private groups, only publish to those groups' relays
    if (tags.groups().exists()) {
      return this
        .scenario(this.getContextSelections(tags.groups()))
        .policy(this.addNoFallbacks)
    }

    return this.scenario(this.forceValue(event.id, [
      this.getPubkeySelection(event.pubkey, RelayMode.Write),
      ...this.getContextSelections(tags.context()),
      ...this.getPubkeySelections(mentions, RelayMode.Read),
    ]))
  }

  FromPubkeys = (pubkeys: string[]) =>
    this.scenario(this.getPubkeySelections(pubkeys, RelayMode.Write))

  ForPubkeys = (pubkeys: string[]) =>
    this.scenario(this.getPubkeySelections(pubkeys, RelayMode.Read))

  WithinGroup = (address: string, relays?: string) =>
    this
      .scenario(this.getContextSelections(Tags.wrap([["a", address]])))
      .policy(this.addNoFallbacks)

  WithinCommunity = (address: string) =>
    this.scenario(this.getContextSelections(Tags.wrap([["a", address]])))

  WithinContext = (address: string) => {
    if (isGroupAddress(decodeAddress(address))) {
      return this.WithinGroup(address)
    }

    if (isCommunityAddress(decodeAddress(address))) {
      return this.WithinCommunity(address)
    }

    throw new Error(`Unknown context ${address}`)
  }

  WithinMultipleContexts = (addresses: string[]) =>
    this.merge(addresses.map(this.WithinContext))

  Search = (term: string, relays: string[] = []) =>
    this.product([term], uniq(relays.concat(this.options.getSearchRelays?.() || [])))

  Indexers = (relays: string[] = []) =>
    this.fromRelays(uniq(relays.concat(this.options.getIndexerRelays?.() || [])))

  // Fallback policies

  addNoFallbacks = (count: number, redundancy: number) => 0

  addMinimalFallbacks = (count: number, redundancy: number) => count > 0 ? 0 : 1

  addMaximalFallbacks = (count: number, redundancy: number) => redundancy - count

  // Higher level utils that use hints

  tagPubkey = (pubkey: string) =>
    Tag.from(["p", pubkey, this.FromPubkeys([pubkey]).getUrl()])

  tagEventId = (event: TrustedEvent, mark = "") =>
    Tag.from(["e", event.id, this.Event(event).getUrl(), mark, event.pubkey])

  tagEventAddress = (event: TrustedEvent, mark = "") =>
    Tag.from(["a", getAddress(event), this.Event(event).getUrl(), mark, event.pubkey])

  tagEvent = (event: TrustedEvent, mark = "") => {
    const tags = [this.tagEventId(event, mark)]

    if (isReplaceable(event)) {
      tags.push(this.tagEventAddress(event, mark))
    }

    return new Tags(tags)
  }

  address = (event: TrustedEvent) =>
    addressFromEvent(event, this.Event(event).redundancy(3).getUrls())
}

// Router Scenario

export type RouterScenarioOptions = {
  redundancy?: number
  policy?: FallbackPolicy
  limit?: number
}

export class RouterScenario {
  constructor(readonly router: Router, readonly selections: ValueRelays[], readonly options: RouterScenarioOptions = {}) {}

  clone = (options: RouterScenarioOptions) =>
    new RouterScenario(this.router, this.selections, {...this.options, ...options})

  select = (f: (selection: string) => boolean) =>
    new RouterScenario(this.router, this.selections.filter(({value}) => f(value)), this.options)

  redundancy = (redundancy: number) => this.clone({redundancy})

  policy = (policy: FallbackPolicy) => this.clone({policy})

  limit = (limit: number) => this.clone({limit})

  getRedundancy = () => this.options.redundancy || this.router.options.getRedundancy?.() || 3

  getPolicy = () => this.options.policy || this.router.addMaximalFallbacks

  getLimit = () => this.options.limit || this.router.options.getLimit?.() || 10

  getSelections = () => {
    const allValues = new Set()
    const valuesByRelay: ValuesByRelay = new Map()
    for (const {value, relays} of this.selections) {
      allValues.add(value)

      for (const relay of relays) {
        if (isShareableRelayUrl(relay)) {
          pushToMapKey(valuesByRelay, relay, value)
        }
      }
    }

    // Adjust redundancy by limit, since if we're looking for very specific values odds
    // are we're less tolerant of failure. Add more redundancy to fill our relay limit.
    const limit = this.getLimit()
    const redundancy = this.getRedundancy()
    const adjustedRedundancy = Math.max(redundancy, redundancy * (limit / (allValues.size * redundancy)))

    const seen = new Map<string, number>()
    const result: ValuesByRelay = new Map()
    const relaySelections = this.router.relaySelectionsFromMap(valuesByRelay)
    for (const {relay} of this.router.sortRelaySelections(relaySelections)) {
      const values = new Set<string>()
      for (const value of valuesByRelay.get(relay) || []) {
        const timesSeen = seen.get(value) || 0

        if (timesSeen < adjustedRedundancy) {
          seen.set(value, timesSeen + 1)
          values.add(value)
        }
      }

      if (values.size > 0) {
        result.set(relay, Array.from(values))
      }
    }

    const fallbacks = shuffle(this.router.options.getFallbackRelays())
    const fallbackPolicy = this.getPolicy()
    for (const {value} of this.selections) {
      const timesSeen = seen.get(value) || 0
      const fallbacksNeeded = fallbackPolicy(timesSeen, adjustedRedundancy)

      if (fallbacksNeeded > 0) {
        for (const relay of fallbacks.slice(0, fallbacksNeeded)) {
          pushToMapKey(result, relay, value)
        }
      }
    }

    const [keep, discard] = splitAt(limit, this.router.relaySelectionsFromMap(result))

    for (const target of keep.slice(0, redundancy)) {
      target.values = uniq(discard.concat(target).flatMap((selection: RelayValues) => selection.values))
    }

    return keep
  }

  getUrls = () => this.getSelections().map((selection: RelayValues) => selection.relay)

  getUrl = () => first(this.getUrls())
}
