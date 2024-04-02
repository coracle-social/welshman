import type {EventTemplate, UnsignedEvent} from 'nostr-tools'
import {first, identity, sortBy, uniq, shuffle} from '@coracle.social/lib'
import type {Rumor} from './Events'
import {getAddress, isReplaceable} from './Events'
import {Tag, Tags} from './Tags'
import {isShareableRelayUrl} from './Relays'
import {GROUP_DEFINITION, COMMUNITY_DEFINITION} from './Kinds'
import {addressFromEvent, decodeAddress, isCommunityAddress, isGroupAddress} from './Address'

export enum RelayMode {
  Read = "read",
  Write = "write",
}

export type RouterOptions = {
  getUserPubkey: () => string | null
  getGroupRelays: (address: string) => string[]
  getCommunityRelays: (address: string) => string[]
  getPubkeyRelays: (pubkey: string, mode?: RelayMode) => string[]
  getStaticRelays: () => string[]
  getIndexerRelays: () => string[]
  getRelayQuality: (url: string) => number
  getRedundancy: () => number
}

export type TagsByRelay = Map<string, Tags>

export type RelayTags = {
  relay: string
  tags: Tags
}

export type TagRelays = {
  tag: Tag
  relays: string[]
}

export type FallbackPolicy = (count: number, limit: number) => number

export class Router {
  constructor(readonly options: RouterOptions) {}

  // Utilities derived from options

  getTagSelections = (tags: Tags) =>
    tags
      .filter(t => isShareableRelayUrl(t.nth(2)))
      .mapTo(t => this.selection(t.take(2), [t.nth(2)]))
      .valueOf()

  getPubkeySelection = (pubkey: string, mode?: RelayMode) =>
    this.pubkeySelection(pubkey, this.options.getPubkeyRelays(pubkey, mode))

  getPubkeySelections = (pubkeys: string[], mode?: RelayMode) =>
    pubkeys.map(pubkey => this.getPubkeySelection(pubkey, mode))

  getUserSelections = (mode?: RelayMode) =>
    this.getPubkeySelections([this.options.getUserPubkey()].filter(identity) as string[], mode)

  getContextSelections = (tags: Tags) => {
    return [
      ...tags.communities().mapTo(t => this.selection(t, this.options.getCommunityRelays(t.value()))).valueOf(),
      ...tags.groups().mapTo(t => this.selection(t, this.options.getGroupRelays(t.value()))).valueOf(),
    ]
  }

  // Utilities for creating ItemSelections

  selection = (tag: Tag, relays: string[]) => ({tag, relays})

  pubkeySelection = (pubkey: string, relays: string[]) =>
    this.selection(Tag.fromPubkey(pubkey), relays)

  // Utilities for processing hints

  relaySelectionsFromMap = (tagsByRelay: TagsByRelay) =>
    Array.from(tagsByRelay).map(([relay, tags]: [string, Tags]) => ({relay, tags}))

  scoreRelaySelection = ({tags, relay}: RelayTags) =>
    tags.count() * this.options.getRelayQuality(relay)

  sortRelaySelections = (relaySelections: RelayTags[]) => {
    const scores = new Map<string, number>()
    const getScore = (relayTags: RelayTags) => scores.get(relayTags.relay) || 0

    for (const relayTags of relaySelections) {
      scores.set(relayTags.relay, this.scoreRelaySelection(relayTags))
    }

    return sortBy(getScore, relaySelections.filter(getScore))
  }

  // Utilities for creating scenarios

  scenario = (selections: TagRelays[]) => new RouterScenario(this, selections)

  merge = (scenarios: RouterScenario[]) =>
    this.scenario(scenarios.flatMap((scenario: RouterScenario) => scenario.selections))

  tagScenario = (tags: Tags, relays: string[]) =>
    this.scenario(tags.mapTo(tag => this.selection(tag, relays)).valueOf())

  idScenario = (ids: string[], relays: string[]) =>
    this.tagScenario(Tags.wrap(ids.map(id => ["e", id])), relays)

  pubkeyScenario = (pubkeys: string[], relays: string[]) =>
    this.tagScenario(Tags.wrap(pubkeys.map(pubkey => ["p", pubkey])), relays)

  addressScenario = (addresses: string[], relays: string[]) =>
    this.tagScenario(Tags.wrap(addresses.map(address => ["a", address])), relays)

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

  Event = (event: UnsignedEvent) =>
    this.scenario([
      this.getPubkeySelection(event.pubkey, RelayMode.Write),
      ...this.getContextSelections(Tags.fromEvent(event).context()),
    ])

  EventChildren = (event: UnsignedEvent) =>
    this.scenario([
      this.getPubkeySelection(event.pubkey, RelayMode.Read),
      ...this.getContextSelections(Tags.fromEvent(event).context()),
    ])

  EventAncestors = (event: UnsignedEvent) => {
    const tags = Tags.fromEvent(event)
    const ptags = tags.whereKey("p")
    const atags = tags.context()
    const {replies, roots} = tags.ancestors()

    return this.scenario([
      ...this.getTagSelections(replies),
      ...this.getTagSelections(roots),
      ...this.getTagSelections(ptags),
      ...this.getContextSelections(atags),
      ...this.getPubkeySelections(ptags.values().valueOf(), RelayMode.Write),
      this.getPubkeySelection(event.pubkey, RelayMode.Read),
    ])
  }

  PublishEvent = (event: UnsignedEvent) => {
    const tags = Tags.fromEvent(event)
    const mentions = tags.values("p").valueOf()

    // If we're publishing to private groups, only publish to those groups' relays
    if (tags.groups().exists()) {
      return this
        .scenario(this.getContextSelections(tags.groups()))
        .policy(this.addNoFallbacks)
    }

    return this.scenario([
      this.getPubkeySelection(event.pubkey, RelayMode.Write),
      ...this.getContextSelections(tags.context()),
      ...this.getPubkeySelections(mentions, RelayMode.Read),
    ])
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

  // Fallback policies

  addNoFallbacks = (count: number, redundancy: number) => count

  addMinimalFallbacks = (count: number, redundancy: number) => Math.max(count, 1)

  addMaximalFallbacks = (count: number, redundancy: number) => redundancy - count

  // Higher level utils that use hints

  tagPubkey = (pubkey: string) =>
    Tag.from(["p", pubkey, this.FromPubkeys([pubkey]).getUrl()])

  tagEventId = (event: Rumor, ...extra: string[]) =>
    Tag.from(["e", event.id, this.Event(event).getUrl(), ...extra])

  tagEventAddress = (event: UnsignedEvent, ...extra: string[]) =>
    Tag.from(["a", getAddress(event), this.Event(event).getUrl(), ...extra])

  tagEvent = (event: Rumor, ...extra: string[]) => {
    const tags = [this.tagEventId(event, ...extra)]

    if (isReplaceable(event)) {
      tags.push(this.tagEventAddress(event, ...extra))
    }

    return new Tags(tags)
  }

  address = (event: UnsignedEvent) =>
    addressFromEvent(event, this.Event(event).redundancy(3).getUrls())
}

// Router Scenario

export type RouterScenarioOptions = {
  redundancy?: number
  policy?: FallbackPolicy
  limit?: number
}

export class RouterScenario {
  constructor(readonly router: Router, readonly selections: TagRelays[], readonly options: RouterScenarioOptions = {}) {}

  clone = (options: RouterScenarioOptions) =>
    new RouterScenario(this.router, this.selections, {...this.options, ...options})

  select = (f: (selection: Tag) => boolean) =>
    new RouterScenario(this.router, this.selections.filter(({tag}) => f(tag)), this.options)

  redundancy = (redundancy: number) => this.clone({redundancy})

  policy = (policy: FallbackPolicy) => this.clone({policy})

  limit = (limit: number) => this.clone({limit})

  getRedundancy = () => this.options.redundancy || this.router.options.getRedundancy()

  getPolicy = () => this.options.policy || this.router.addMaximalFallbacks

  getLimit = () => this.options.limit

  getSelections = () => {
    const tagsByRelay: TagsByRelay = new Map()
    for (const {tag, relays} of this.selections) {
      for (const relay of relays) {
        addTagToMap(tagsByRelay, relay, tag)
      }
    }

    const redundancy = this.getRedundancy()
    const seen = new Map<string, number>()
    const result: TagsByRelay = new Map()
    const relaySelections = this.router.relaySelectionsFromMap(tagsByRelay)
    for (const {relay} of this.router.sortRelaySelections(relaySelections)) {
      const tags = []
      for (const tag of tagsByRelay.get(relay)?.valueOf() || []) {
        const timesSeen = seen.get(tag.value()) || 0

        if (timesSeen < redundancy) {
          seen.set(tag.value(), timesSeen + 1)
          tags.push(tag)
        }
      }

      if (tags.length > 0) {
        result.set(relay, Tags.from(tags))
      }
    }

    const fallbacks = shuffle(this.router.options.getStaticRelays())
    const fallbackPolicy = this.getPolicy()
    for (const {tag} of this.selections) {
      const timesSeen = seen.get(tag.value()) || 0
      const fallbacksNeeded = fallbackPolicy(timesSeen, redundancy)

      if (fallbacksNeeded > 0) {
        for (const relay of fallbacks.slice(0, fallbacksNeeded)) {
          addTagToMap(result, relay, tag)
        }
      }
    }

    const limit = this.getLimit()

    return limit
      ? this.router.relaySelectionsFromMap(result).slice(0, limit)
      : this.router.relaySelectionsFromMap(result)
  }

  getUrls = () => this.getSelections().map((selection: RelayTags) => selection.relay)

  getUrl = () => first(this.getUrls())
}

const addTagToMap = (m: Map<string, Tags>, k: string, v: Tag) =>
  m.set(k, (m.get(k) || Tags.from([])).append(v))
