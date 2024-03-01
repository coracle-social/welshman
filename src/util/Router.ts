import type {EventTemplate, UnsignedEvent} from 'nostr-tools'
import type {Rumor} from './Events'
import {nip19} from 'nostr-tools'
import {getAddress, isReplaceable} from './Events'
import {Tag, Tags} from './Tags'
import {first, uniq, shuffle} from './Tools'
import {isGroupAddress, isCommunityAddress} from './Address'

export enum RelayMode {
  Inbox = "inbox",
  Outbox = "outbox",
}

export type RouterOptions = {
  getUserPubkey: () => string | null
  getGroupRelays: (address: string) => string[]
  getCommunityRelays: (address: string) => string[]
  getPubkeyInboxRelays: (pubkey: string) => string[]
  getPubkeyOutboxRelays: (pubkey: string) => string[]
  getFallbackInboxRelays: () => string[]
  getFallbackOutboxRelays: () => string[]
  getRelayQuality?: (url: string) => number
  getDefaultLimit: () => number
}

// - Fetch from and publish to non-shareable relays, but don't use them for hints
// - Test that scoring/sorting makes sense, particularly asc/desc sort

export class Router {
  constructor(readonly options: RouterOptions) {}

  // Utilities derived from options

  getAllPubkeyRelays = (pubkey: string) =>
    [
      ...this.options.getPubkeyInboxRelays(pubkey),
      ...this.options.getPubkeyOutboxRelays(pubkey),
    ]

  getUserInboxRelays = () => {
    const pubkey = this.options.getUserPubkey()

    return pubkey ? this.options.getPubkeyInboxRelays(pubkey) : []
  }

  getUserOutboxRelays = () => {
    const pubkey = this.options.getUserPubkey()

    return pubkey ? this.options.getPubkeyOutboxRelays(pubkey) : []
  }

  getAllUserRelays = () => {
    const pubkey = this.options.getUserPubkey()

    return pubkey ? this.getAllPubkeyRelays(pubkey) : []
  }

  getEventContextRelayGroups = (event: EventTemplate) => {
    const addresses = Tags.fromEvent(event).context().values().valueOf()

    return [
      ...addresses.filter(isCommunityAddress).map(this.options.getCommunityRelays),
      ...addresses.filter(isGroupAddress).map(this.options.getGroupRelays),
    ]
  }

  // Utilities for processing hints

  getGroupScores = (groups: string[][]) => {
    const scores: RouteScenarioScores = {}

    groups.forEach((urls, i) => {
      for (const url of shuffle(uniq(urls))) {
        if (!scores[url]) {
          scores[url] = {score: 0, count: 0}
        }

        scores[url].score += 1 / (i + 1)
        scores[url].count += 1
      }
    })

    // Use log-sum-exp to get a a weighted sum
    for (const [url, score] of Object.entries(scores)) {
      const weight = Math.log(groups.length / score.count)
      const thisScore = Math.log1p(Math.exp(score.score - score.count))
      const thatScore = this.options.getRelayQuality?.(url) || 1

      score.score = (weight + thisScore) * thatScore
    }

    return scores
  }

  urlsFromScores = (limit: number, scores: RouteScenarioScores) =>
    Object.entries(scores).sort((a, b) => a[1].score > b[1].score ? -1 : 1).map(pair => pair[0] as string).slice(0, limit)

  groupsToUrls = (limit: number, groups: string[][]) => this.urlsFromScores(limit, this.getGroupScores(groups))

  scenario = (options: RouterScenarioOptions) => new RouterScenario(this, options)

  merge = ({fallbackPolicy, scenarios}: {fallbackPolicy: FallbackPolicy, scenarios: RouterScenario[]}) =>
    this.scenario({fallbackPolicy, getGroups: () => scenarios.map(s => s.getRawUrls())})

  // Routing scenarios

  Broadcast = () => this.scenario({
    fallbackPolicy: useMinimalFallbacks(RelayMode.Outbox),
    getGroups: () => [this.getAllUserRelays()],
  })

  Aggregate = () => this.scenario({
    fallbackPolicy: useMinimalFallbacks(RelayMode.Inbox),
    getGroups: () => [this.getAllUserRelays()],
  })

  NoteToSelf = () => this.scenario({
    fallbackPolicy: useMaximalFallbacks(RelayMode.Inbox),
    getGroups: () => [this.getUserInboxRelays()],
  })

  FetchAllMessages = () => this.scenario({
    fallbackPolicy: useMinimalFallbacks(RelayMode.Inbox),
    getGroups: () => [this.getAllUserRelays()],
  })

  FetchMessages = (pubkeys: string[]) => this.scenario({
    fallbackPolicy: useMinimalFallbacks(RelayMode.Inbox),
    getGroups: () => [
      this.getAllUserRelays(),
      ...pubkeys.map(this.getAllPubkeyRelays)
    ],
  })

  PublishMessage = (pubkeys: string[]) => this.scenario({
    fallbackPolicy: useMinimalFallbacks(RelayMode.Outbox),
    getGroups: () => [
      this.getUserOutboxRelays(),
      ...pubkeys.map(this.options.getPubkeyInboxRelays)
    ],
  })

  FetchEvent = (event: UnsignedEvent) => this.scenario({
    fallbackPolicy: useMaximalFallbacks(RelayMode.Inbox),
    getGroups: () => [
      this.options.getPubkeyOutboxRelays(event.pubkey),
      ...this.getEventContextRelayGroups(event),
    ],
  })

  FetchEventChildren = (event: UnsignedEvent) => this.scenario({
    fallbackPolicy: useMaximalFallbacks(RelayMode.Inbox),
    getGroups: () => [
      this.options.getPubkeyInboxRelays(event.pubkey),
      ...this.getEventContextRelayGroups(event),
    ],
  })

  FetchEventParent = (event: UnsignedEvent) => this.scenario({
    fallbackPolicy: useMaximalFallbacks(RelayMode.Inbox),
    getGroups: () => [
      Tags.fromEvent(event).replies().relays().valueOf(),
      this.options.getPubkeyInboxRelays(event.pubkey),
      ...this.getEventContextRelayGroups(event),
    ],
  })

  FetchEventRoot = (event: UnsignedEvent) => this.scenario({
    fallbackPolicy: useMaximalFallbacks(RelayMode.Inbox),
    getGroups: () => [
      Tags.fromEvent(event).roots().relays().valueOf(),
      this.options.getPubkeyInboxRelays(event.pubkey),
      ...this.getEventContextRelayGroups(event),
    ],
  })

  PublishEvent = (event: UnsignedEvent) => this.scenario({
    fallbackPolicy: useMinimalFallbacks(RelayMode.Outbox),
    getGroups: () => {
      const tags = Tags.fromEvent(event)
      const mentions = tags.values("p").valueOf()
      const addresses = tags.context().values().valueOf()
      const groupAddresses = addresses.filter(isGroupAddress)
      const communityAddresses = addresses.filter(isCommunityAddress)

      // If we're publishing only to private groups, only publish to those groups' relays.
      // Otherwise, publish to all relays, because it's essentially public.
      if (groupAddresses.length > 0 && communityAddresses.length === 0) {
        return groupAddresses.map(this.options.getGroupRelays)
      }

      return  [
        this.options.getPubkeyOutboxRelays(event.pubkey),
        ...groupAddresses.map(this.options.getGroupRelays),
        ...communityAddresses.map(this.options.getCommunityRelays),
        ...mentions.map((pk: string) => this.options.getPubkeyInboxRelays(pk)),
      ]
    },
  })

  FetchFromHints = (...groups: string[][]) => this.scenario({
    fallbackPolicy: useMaximalFallbacks(RelayMode.Inbox),
    getGroups: () => [...groups, this.getAllUserRelays()],
  })

  FetchFromPubkey = (pubkey: string) => this.scenario({
    fallbackPolicy: useMaximalFallbacks(RelayMode.Outbox),
    getGroups: () => [this.options.getPubkeyOutboxRelays(pubkey)],
  })

  FetchFromPubkeys = (pubkeys: string[]) => this.scenario({
    fallbackPolicy: useMaximalFallbacks(RelayMode.Outbox),
    getGroups: () => pubkeys.map(this.options.getPubkeyOutboxRelays),
  })

  FetchFromGroup = (address: string) => this.scenario({
    fallbackPolicy: useNoFallbacks(),
    getGroups: () => [this.options.getGroupRelays(address)],
  })

  PublishToGroup = (address: string) => this.scenario({
    fallbackPolicy: useNoFallbacks(),
    getGroups: () => [this.options.getGroupRelays(address)],
  })

  FetchFromCommunity = (address: string) => this.scenario({
    fallbackPolicy: useMaximalFallbacks(RelayMode.Inbox),
    getGroups: () => [this.options.getCommunityRelays(address)],
  })

  PublishToCommunity = (address: string) => this.scenario({
    fallbackPolicy: useMaximalFallbacks(RelayMode.Outbox),
    getGroups: () => [this.options.getCommunityRelays(address)],
  })

  FetchFromContext = (address: string) => {
    if (isGroupAddress(address)) {
      return this.FetchFromGroup(address)
    }

    if (isCommunityAddress(address)) {
      return this.FetchFromCommunity(address)
    }

    throw new Error(`Unknown context ${address}`)
  }

  FetchFromContexts = (addresses: string[]) =>
    this.merge({
      fallbackPolicy: useMinimalFallbacks(RelayMode.Outbox),
      scenarios: addresses.map(this.FetchFromContext),
    })

  PublishToContext = (address: string) => {
    if (isGroupAddress(address)) {
      return this.PublishToGroup(address)
    }

    if (isCommunityAddress(address)) {
      return this.PublishToCommunity(address)
    }

    throw new Error(`Unknown context ${address}`)
  }

  PublishToContexts = (addresses: string[]) =>
    this.merge({
      fallbackPolicy: useMinimalFallbacks(RelayMode.Outbox),
      scenarios: addresses.map(this.PublishToContext),
    })

  // Higher level utils that use hints

  tagPubkey = (pubkey: string) =>
    Tag.from(["p", pubkey, this.FetchFromPubkey(pubkey).getUrl()])

  tagEventId = (event: Rumor, ...extra: string[]) =>
    Tag.from(["e", event.id, this.FetchEvent(event).getUrl(), ...extra])

  tagEventAddress = (event: UnsignedEvent, ...extra: string[]) =>
    Tag.from(["a", getAddress(event), this.FetchEvent(event).getUrl(), ...extra])

  tagEvent = (event: Rumor, ...extra: string[]) => {
    const tags = [this.tagEventId(event, ...extra)]

    if (isReplaceable(event)) {
      tags.push(this.tagEventAddress(event, ...extra))
    }

    return new Tags(tags)
  }

  getNaddr = (event: UnsignedEvent) =>
    nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: Tags.fromEvent(event).get("d")?.value() || "",
      relays: this.FetchEvent(event).getUrls(3),
    })
}

// Router Scenario

export type RouterScenarioOptions = {
  getGroups: () => string[][]
  fallbackPolicy: FallbackPolicy
}

export type RouteScenarioScores = Record<string, {score: number, count: number}>

export class RouterScenario {
  constructor(readonly router: Router, readonly options: RouterScenarioOptions) {}

  getFallbackRelays = () => {
    switch (this.options.fallbackPolicy.mode) {
      case RelayMode.Inbox:
        return this.router.options.getFallbackInboxRelays()
      case RelayMode.Outbox:
        return this.router.options.getFallbackOutboxRelays()
      default:
        throw new Error(`Invalid relay mode ${this.options.fallbackPolicy.mode}`)
    }
  }

  addFallbacks = (limit: number, urls: string[]) => {
    if (urls.length < limit) {
      const fallbackRelays = this.getFallbackRelays()
      const fallbackLimit = this.options.fallbackPolicy.getLimit(limit, urls)

      return [...urls, ...fallbackRelays.slice(0, fallbackLimit)]
    }

    return urls
  }

  getRawUrls = (limit?: number, extra: string[] = []) => {
    const maxRelays = limit || this.router.options.getDefaultLimit()
    const urlGroups = this.options.getGroups().concat([extra])

    return this.router.groupsToUrls(maxRelays, urlGroups)
  }

  getUrls = (limit?: number, extra: string[] = []) => {
    const maxRelays = limit || this.router.options.getDefaultLimit()
    const urlGroups = [extra].concat(this.options.getGroups())
    const urls = this.router.groupsToUrls(maxRelays, urlGroups)

    return this.addFallbacks(maxRelays, urls)
  }

  getUrl = () => first(this.getUrls(1))
}

// Fallback Policy

export class FallbackPolicy {
  constructor(readonly mode: string, readonly getLimit: (limit: number, urls: string[]) => number) {}
}

export const useNoFallbacks = () => new FallbackPolicy(RelayMode.Inbox, (limit: number, urls: string[]) => 0)

export const useMinimalFallbacks = (mode: string) => new FallbackPolicy(mode, (limit: number, urls: string[]) => urls.length === 0 ? 1 : 0)

export const useMaximalFallbacks = (mode: string) => new FallbackPolicy(mode, (limit: number, urls: string[]) => Math.max(0, limit - urls.length))
