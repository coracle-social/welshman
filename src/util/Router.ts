import type {Event} from 'nostr-tools'
import {Tags} from './Tags'
import {nth, first} from '../util/Tools'

export type RouterOptions = {
  getUserPubkey: () => string | null
  getGroupRelayTags: (address: string) => string[][]
  getCommunityRelayTags: (address: string) => string[][]
  getPubkeyRelayTags: (pubkey: string) => string[][]
  getFallbackRelayTags: () => string[][]
  getRelayQuality?: (url: string) => number
}

// - Fetch from and publish to non-shareable relays, but don't use them for hints
// - Test that scoring/sorting makes sense, particularly asc/desc sort

export class Router {
  constructor(readonly options: RouterOptions) {}

  // Utilities derived from options

  getGroupRelayUrls = (address: string) =>
    this.options.getGroupRelayTags(address).map(nth(1))

  getCommunityRelayUrls = (address: string) =>
    this.options.getCommunityRelayTags(address).map(nth(1))

  getPubkeyRelayTags = (pubkey: string, mode?: string) => {
    const tags = this.options.getPubkeyRelayTags(pubkey)

    return mode ? Tags.from(tags).whereMark(mode).valueOf() : tags
  }

  getPubkeyRelayUrls = (pubkey: string, mode?: string) =>
    this.getPubkeyRelayTags(pubkey, mode).map(nth(1))

  getUserRelayTags = (mode?: string) => {
    const pubkey = this.options.getUserPubkey()

    return pubkey ? this.getPubkeyRelayTags(pubkey, mode) : []
  }

  getUserRelayUrls = (mode?: string) => {
    const pubkey = this.options.getUserPubkey()

    return pubkey ? this.getPubkeyRelayUrls(pubkey, mode) : []
  }

  getEventGroupOrCommunityRelayUrlGroups = (event: Event, otherGroups: string[][]) => {
    const groupAddresses = Tags.fromEvent(event).groups().valueOf()

    if (groupAddresses.length > 0) {
      return groupAddresses.map(this.getGroupRelayUrls)
    }

    return [
      ...Tags.fromEvent(event).communities().valueOf().map(this.getCommunityRelayUrls),
      ...otherGroups,
    ]
  }

  // Utilities for processing hints

  getGroupScores = (groups: string[][]) => {
    const scores: RouteScenarioScores = {}

    // TODO: see if weighting earlier groups slightly heavier improves things
    for (const urls of groups) {
      urls.forEach((url, i) => {
        const score = 1 / (i + 1) / urls.length

        if (!scores[url]) {
          scores[url] = {score: 0, count: 0}
        }

        scores[url].score += score
        scores[url].count += 1
      })
    }

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
    Object.entries(scores).sort((a, b) => a[1].score > b[1].score ? 1 : -1).map(pair => pair[0] as string).slice(0, limit)

  groupsToUrls = (limit: number, groups: string[][]) =>
    this.urlsFromScores(limit, this.getGroupScores(groups))

  // Routing scenarios

  FetchAllDirectMessage = () => new RouterScenario(this, {
    fallbackPolicy: useMinimalFallbacks("read"),
    getGroups: () => [this.getUserRelayUrls()],
  })

  FetchDirectMessages = (pubkey: string) => new RouterScenario(this, {
    fallbackPolicy: useMinimalFallbacks("read"),
    getGroups: () => [this.getUserRelayUrls(), this.getPubkeyRelayUrls(pubkey)],
  })

  PublishDirectMessage = (pubkey: string) => new RouterScenario(this, {
    fallbackPolicy: useMinimalFallbacks("write"),
    getGroups: () => [this.getUserRelayUrls("write"), this.getPubkeyRelayUrls(pubkey, "read")],
  })

  FetchPubkeyEvents = (pubkey: string) => new RouterScenario(this, {
    fallbackPolicy: useMaximalFallbacks("read"),
    getGroups: () => [this.getPubkeyRelayUrls(pubkey, "write")],
  })

  FetchEvent = (event: Event) => new RouterScenario(this, {
    fallbackPolicy: useMaximalFallbacks("read"),
    getGroups: () =>
      this.getEventGroupOrCommunityRelayUrlGroups(event, [
        this.getPubkeyRelayUrls(event.pubkey, "write"),
      ]),
  })

  FetchEventChildren = (event: Event) => new RouterScenario(this, {
    fallbackPolicy: useMaximalFallbacks("read"),
    getGroups: () =>
      this.getEventGroupOrCommunityRelayUrlGroups(event, [
        this.getPubkeyRelayUrls(event.pubkey, "read"),
      ]),
  })

  FetchEventParent = (event: Event) => new RouterScenario(this, {
    fallbackPolicy: useMaximalFallbacks("read"),
    getGroups: () =>
      this.getEventGroupOrCommunityRelayUrlGroups(event, [
        Tags.fromEvent(event).replies().relays().valueOf(),
        this.getPubkeyRelayUrls(event.pubkey, "read"),
      ]),
  })

  FetchEventRoot = (event: Event) => new RouterScenario(this, {
    fallbackPolicy: useMaximalFallbacks("read"),
    getGroups: () =>
      this.getEventGroupOrCommunityRelayUrlGroups(event, [
        Tags.fromEvent(event).roots().relays().valueOf(),
        this.getPubkeyRelayUrls(event.pubkey, "read"),
      ]),
  })

  PublishEvent = (event: Event) => new RouterScenario(this, {
    fallbackPolicy: useMinimalFallbacks("write"),
    getGroups: () =>
      this.getEventGroupOrCommunityRelayUrlGroups(event, [
        this.getPubkeyRelayUrls(event.pubkey, "write"),
        ...Tags.fromEvent(event).whereKey("p").values().valueOf().map((pk: string) => this.getPubkeyRelayUrls(pk, "read")),
      ]),
  })

  FetchFromGroup = (address: string) => new RouterScenario(this, {
    fallbackPolicy: useNoFallbacks(),
    getGroups: () => [this.getGroupRelayUrls(address)],
  })

  PublishToGroup = (address: string) => new RouterScenario(this, {
    fallbackPolicy: useNoFallbacks(),
    getGroups: () => [this.getGroupRelayUrls(address)],
  })

  FetchFromCommunity = (address: string) => new RouterScenario(this, {
    fallbackPolicy: useMaximalFallbacks("read"),
    getGroups: () => [this.getCommunityRelayUrls(address)],
  })

  PublishToCommunity = (address: string) => new RouterScenario(this, {
    fallbackPolicy: useMaximalFallbacks("write"),
    getGroups: () => [this.getCommunityRelayUrls(address)],
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

  addFallbackUrls = (limit: number, urls: string[]) => {
    if (urls.length < limit) {
      const {mode, getLimit} = this.options.fallbackPolicy
      const fallbackRelayTags = this.router.options.getFallbackRelayTags()
      const fallbackUrls = Tags.from(fallbackRelayTags).whereMark(mode).values().valueOf()
      const fallbackLimit = getLimit(limit, urls)

      return [...urls, ...fallbackUrls.slice(0, fallbackLimit)]
    }

    return urls
  }

  getUrls = (limit: number, extra: string[] = []) => {
    const urlGroups = this.options.getGroups().concat([extra])
    const urls = this.router.groupsToUrls(limit, urlGroups)

    return this.addFallbackUrls(limit, urls)
  }

  getUrl = () => first(this.getUrls(1))
}

// Fallback Policy

class FallbackPolicy {
  constructor(readonly mode: string, readonly getLimit: (limit: number, urls: string[]) => number) {}
}

const useNoFallbacks = () => new FallbackPolicy("read", (limit: number, urls: string[]) => 0)

const useMinimalFallbacks = (mode: string) => new FallbackPolicy(mode, (limit: number, urls: string[]) => urls.length === 0 ? 1 : 0)

const useMaximalFallbacks = (mode: string) => new FallbackPolicy(mode, (limit: number, urls: string[]) => Math.max(0, limit - urls.length))
