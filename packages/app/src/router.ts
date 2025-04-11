import {
  intersection,
  mergeLeft,
  first,
  clamp,
  sortBy,
  shuffle,
  pushToMapKey,
  inc,
  add,
  ago,
  take,
  chunks,
  MINUTE,
  HOUR,
  DAY,
} from "@welshman/lib"
import {
  getFilterId,
  isRelayUrl,
  isOnionUrl,
  isLocalUrl,
  isIPAddress,
  isShareableRelayUrl,
  COMMENT,
  PROFILE,
  RELAYS,
  INBOX_RELAYS,
  FOLLOWS,
  WRAP,
  getReplyTags,
  getCommentTags,
  getPubkeyTagValues,
  normalizeRelayUrl,
  TrustedEvent,
  Filter,
} from "@welshman/util"
import {Pool} from "@welshman/net"
import {pubkey} from "./session.js"
import {
  relaySelectionsByPubkey,
  inboxRelaySelectionsByPubkey,
  getReadRelayUrls,
  getWriteRelayUrls,
  getRelayUrls,
} from "./relaySelections.js"
import {relaysByUrl} from "./relays.js"

export const INDEXED_KINDS = [PROFILE, RELAYS, INBOX_RELAYS, FOLLOWS]

export type RelaysAndFilters = {
  relays: string[]
  filters: Filter[]
}

export enum RelayMode {
  Read = "read",
  Write = "write",
  Inbox = "inbox",
}

export type RouterOptions = {
  /**
   * Retrieves the user's public key.
   * @returns The user's public key as a string, or null if not available.
   */
  getUserPubkey?: () => string | undefined

  /**
   * Retrieves relays for the specified public key and mode.
   * @param pubkey - The public key to retrieve relays for.
   * @param mode - The relay mode (optional). May be "read", "write", or "inbox".
   * @returns An array of relay URLs as strings.
   */
  getPubkeyRelays?: (pubkey: string, mode?: RelayMode) => string[]

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
   * Retrieves the quality of the specified relay.
   * @param url - The URL of the relay to retrieve quality for.
   * @returns The quality of the relay as a number between 0 and 1 inclusive.
   */
  getRelayQuality?: (url: string) => number

  /**
   * Retrieves the limit setting, which is the maximum number of relays that should be
   * returned from getUrls and getSelections.
   * @returns The limit setting as a number.
   */
  getLimit?: () => number
}

export type Selection = {
  weight: number
  relays: string[]
}

const makeSelection = (relays: string[], weight = 1): Selection => ({
  relays: relays.filter(isRelayUrl).map(normalizeRelayUrl),
  weight,
})

// Fallback policies

export type FallbackPolicy = (count: number, limit: number) => number

export const addNoFallbacks = (count: number, limit: number) => 0

export const addMinimalFallbacks = (count: number, limit: number) => (count > 0 ? 0 : 1)

export const addMaximalFallbacks = (count: number, limit: number) => limit - count

// Default router options

export const getRelayQuality = (url: string) => {
  const relay = relaysByUrl.get().get(url)

  // Skip non-relays entirely
  if (!isRelayUrl(url)) return 0

  // If we have recent errors, skip it
  if (relay?.stats) {
    if (relay.stats.recent_errors.filter(n => n > ago(MINUTE)).length > 0) return 0
    if (relay.stats.recent_errors.filter(n => n > ago(HOUR)).length > 3) return 0
    if (relay.stats.recent_errors.filter(n => n > ago(DAY)).length > 10) return 0
  }

  // Prefer stuff we're connected to
  if (Pool.getSingleton().has(url)) return 1

  // Prefer stuff we've connected to in the past
  if (relay?.stats) return 0.9

  // If it's not weird url give it an ok score
  if (!isIPAddress(url) && !isLocalUrl(url) && !isOnionUrl(url) && !url.startsWith("ws://")) {
    return 0.8
  }

  // Default to a "meh" score
  return 0.7
}

export const getPubkeyRelays = (pubkey: string, mode?: string) => {
  const $relaySelections = relaySelectionsByPubkey.get()
  const $inboxSelections = inboxRelaySelectionsByPubkey.get()

  switch (mode) {
    case RelayMode.Read:
      return getReadRelayUrls($relaySelections.get(pubkey))
    case RelayMode.Write:
      return getWriteRelayUrls($relaySelections.get(pubkey))
    case RelayMode.Inbox:
      return getRelayUrls($inboxSelections.get(pubkey))
    default:
      return getRelayUrls($relaySelections.get(pubkey))
  }
}

export const routerContext: RouterOptions = {
  getRelayQuality,
  getPubkeyRelays,
  getDefaultRelays: () => ["wss://relay.damus.io/", "wss://nos.lol/"],
  getIndexerRelays: () => ["wss://purplepag.es/", "wss://relay.nostr.band/"],
  getSearchRelays: () => ["wss://relay.nostr.band/", "wss://nostr.wine/"],
  getUserPubkey: () => pubkey.get(),
  getLimit: () => 3,
}

// Router class

export class Router {
  readonly options: RouterOptions

  static configure(options: RouterOptions) {
    Object.assign(routerContext, options)
  }

  static get() {
    return new Router(routerContext)
  }

  constructor(options: RouterOptions) {
    this.options = mergeLeft(options, routerContext)
  }

  // Utilities derived from options

  getRelaysForPubkey = (pubkey: string, mode?: RelayMode) =>
    this.options.getPubkeyRelays?.(pubkey, mode) || []

  getRelaysForPubkeys = (pubkeys: string[], mode?: RelayMode) =>
    pubkeys.map(pubkey => this.getRelaysForPubkey(pubkey, mode))

  getRelaysForUser = (mode?: RelayMode) => {
    const pubkey = this.options.getUserPubkey?.()

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

  UserInbox = () => this.FromRelays(this.getRelaysForUser(RelayMode.Inbox))

  ForPubkey = (pubkey: string) => this.FromRelays(this.getRelaysForPubkey(pubkey, RelayMode.Read))

  FromPubkey = (pubkey: string) => this.FromRelays(this.getRelaysForPubkey(pubkey, RelayMode.Write))

  PubkeyInbox = (pubkey: string) =>
    this.FromRelays(this.getRelaysForPubkey(pubkey, RelayMode.Inbox))

  ForPubkeys = (pubkeys: string[]) => this.merge(pubkeys.map(pubkey => this.ForPubkey(pubkey)))

  FromPubkeys = (pubkeys: string[]) => this.merge(pubkeys.map(pubkey => this.FromPubkey(pubkey)))

  PubkeyInboxes = (pubkeys: string[]) => this.merge(pubkeys.map(pubkey => this.PubkeyInbox(pubkey)))

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

  EventAncestors = (event: TrustedEvent, type: "mentions" | "replies" | "roots") => {
    const ancestorTags =
      event.kind === COMMENT ? getCommentTags(event.tags) : getReplyTags(event.tags)

    const tags: string[][] = (ancestorTags as any)[type] || []

    return this.scenario(
      tags.flatMap(([_, value, relay, pubkey]) => {
        const selections = [makeSelection(this.ForUser().getUrls(), 0.5)]

        if (pubkey) {
          selections.push(makeSelection(this.FromPubkey(pubkey).getUrls()))
        }

        if (relay) {
          selections.push(makeSelection([relay], 0.9))
        }

        return selections
      }),
    )
  }

  EventMentions = (event: TrustedEvent) => this.EventAncestors(event, "mentions")

  EventParents = (event: TrustedEvent) => this.EventAncestors(event, "replies")

  EventRoots = (event: TrustedEvent) => this.EventAncestors(event, "roots")

  PublishEvent = (event: TrustedEvent) => {
    const pubkeys = getPubkeyTagValues(event.tags)

    return this.merge([
      this.FromPubkey(event.pubkey),
      ...pubkeys.map(pubkey => this.ForPubkey(pubkey).weight(0.5)),
    ])
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
      const quality = this.router.options.getRelayQuality?.(relay)
      const weight = relayWeights.get(relay)!

      // Log the weight, since it's a straight count which ends up over-weighting hubs.
      // Also add some random noise so that we'll occasionally pick lower quality/less
      // popular relays.
      return quality ? -(quality * inc(Math.log(weight)) * Math.random()) : 0
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

// Infer relay selections from filters

type FilterScenario = {filter: Filter; scenario: RouterScenario}

type FilterSelectionRule = (filter: Filter) => FilterScenario[]

export const getFilterSelectionsForSearch = (filter: Filter) => {
  if (!filter.search) return []

  const relays = routerContext.getSearchRelays?.() || []

  return [{filter, scenario: Router.get().FromRelays(relays).weight(10)}]
}

export const getFilterSelectionsForWraps = (filter: Filter) => {
  if (!filter.kinds?.includes(WRAP) || filter.authors) return []

  return [
    {
      filter: {...filter, kinds: [WRAP]},
      scenario: Router.get().UserInbox(),
    },
  ]
}

export const getFilterSelectionsForIndexedKinds = (filter: Filter) => {
  const kinds = intersection(INDEXED_KINDS, filter.kinds || [])

  if (kinds.length === 0) return []

  const relays = routerContext.getIndexerRelays?.() || []

  return [
    {
      filter: {...filter, kinds},
      scenario: Router.get().FromRelays(relays),
    },
  ]
}

export const getFilterSelectionsForAuthors = (filter: Filter) => {
  if (!filter.authors) return []

  const chunkCount = clamp([1, 30], Math.round(filter.authors.length / 30))

  return chunks(chunkCount, filter.authors).map(authors => ({
    filter: {...filter, authors},
    scenario: Router.get().FromPubkeys(authors),
  }))
}

export const getFilterSelectionsForUser = (filter: Filter) => [
  {filter, scenario: Router.get().ForUser().weight(0.2)},
]

export const defaultFilterSelectionRules = [
  getFilterSelectionsForSearch,
  getFilterSelectionsForWraps,
  getFilterSelectionsForIndexedKinds,
  getFilterSelectionsForAuthors,
  getFilterSelectionsForUser,
]

export const getFilterSelections = (
  filters: Filter[],
  rules: FilterSelectionRule[] = defaultFilterSelectionRules,
): RelaysAndFilters[] => {
  const filtersById = new Map<string, Filter>()
  const scenariosById = new Map<string, RouterScenario[]>()

  for (const filter of filters) {
    for (const filterScenario of rules.flatMap(rule => rule(filter))) {
      const id = getFilterId(filterScenario.filter)

      filtersById.set(id, filterScenario.filter)
      pushToMapKey(scenariosById, id, filterScenario.scenario)
    }
  }

  const result = []

  for (const [id, filter] of filtersById.entries()) {
    const scenario = Router.get()
      .merge(scenariosById.get(id) || [])
      .policy(addMinimalFallbacks)

    result.push({filters: [filter], relays: scenario.getUrls()})
  }

  return result
}
