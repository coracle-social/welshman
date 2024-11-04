import {
  intersection,
  first,
  switcher,
  throttleWithValue,
  clamp,
  last,
  splitAt,
  identity,
  sortBy,
  uniq,
  shuffle,
  pushToMapKey,
  now,
  assoc,
  ctx,
  sample,
} from "@welshman/lib"
import {
  Tags,
  getFilterId,
  unionFilters,
  isShareableRelayUrl,
  isContextAddress,
  PROFILE,
  RELAYS,
  INBOX_RELAYS,
  FOLLOWS,
  LOCAL_RELAY_URL,
  WRAP,
} from "@welshman/util"
import type {TrustedEvent, Filter} from "@welshman/util"
import {ConnectionStatus, AuthStatus} from "@welshman/net"
import type {RelaysAndFilters} from "@welshman/net"
import {pubkey} from "./session"
import {
  relaySelectionsByPubkey,
  inboxRelaySelectionsByPubkey,
  getReadRelayUrls,
  getWriteRelayUrls,
  getRelayUrls,
} from "./relaySelections"
import {relays, relaysByUrl} from "./relays"

export const INDEXED_KINDS = [PROFILE, RELAYS, INBOX_RELAYS, FOLLOWS]

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
  getUserPubkey?: () => string | null

  /**
   * Retrieves relays for the specified public key and mode.
   * @param pubkey - The public key to retrieve relays for.
   * @param mode - The relay mode (optional). May be "read", "write", or "inbox".
   * @returns An array of relay URLs as strings.
   */
  getPubkeyRelays?: (pubkey: string, mode?: RelayMode) => string[]

  /**
   * Retrieves fallback relays, for use when no other relays can be selected.
   * @returns An array of relay URLs as strings.
   */
  getFallbackRelays: () => string[]

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
  weight: number,
  relays: string[],
}

const makeSelection = (relays: string[], weight = 1): Selection => ({relays, weight})

// Fallback policies

export type FallbackPolicy = (count: number, limit: number) => number

export const addNoFallbacks = (count: number, limit: number) => 0

export const addMinimalFallbacks = (count: number, limit: number) => count > 0 ? 0 : 1

export const addMaximalFallbacks = (count: number, limit: number) => limit - count

export class Router {
  constructor(readonly options: RouterOptions) {}

  // Utilities derived from options

  getRelaysForPubkey = (pubkey: string, mode?: RelayMode) =>
    this.options.getPubkeyRelays?.(pubkey, mode) || []

  getRelaysForPubkeys = (pubkeys: string[], mode?: RelayMode) =>
    pubkeys.map(pubkey => this.getRelaysForPubkey(pubkey, mode))

  getRelaysForUser = (mode?: RelayMode) => {
    const pubkey = this.options.getUserPubkey?.()

    return pubkey ? this.getRelaysForPubkey(pubkey) : []
  }

  // Utilities for creating scenarios

  scenario = (selections: Selection[]) => new RouterScenario(this, selections)

  merge = (scenarios: RouterScenario[]) =>
    this.scenario(scenarios.flatMap((scenario: RouterScenario) => scenario.selections))

  // Routing scenarios

  FromRelays = (relays: string[]) =>
    this.scenario([makeSelection(relays)])

  ForPubkey = (pubkey: string) =>
    this.FromRelays(this.getRelaysForPubkey(pubkey, RelayMode.Read))

  FromPubkey = (pubkey: string) =>
    this.FromRelays(this.getRelaysForPubkey(pubkey, RelayMode.Write))

  PubkeyInbox = (pubkey: string) =>
    this.FromRelays(this.getRelaysForPubkey(pubkey, RelayMode.Inbox)).policy(addNoFallbacks)

  ForUser = () =>
    this.FromRelays(this.getRelaysForUser(RelayMode.Read))

  FromUser = () =>
    this.FromRelays(this.getRelaysForUser(RelayMode.Write))

  UserInbox = () =>
    this.FromRelays(this.getRelaysForUser(RelayMode.Inbox)).policy(addNoFallbacks)

  ForPubkeys = (pubkeys: string[]) =>
    this.merge(pubkeys.map(pubkey => this.ForPubkey(pubkey)))

  FromPubkeys = (pubkeys: string[]) =>
    this.merge(pubkeys.map(pubkey => this.FromPubkey(pubkey)))

  PubkeyInboxes = (pubkeys: string[]) =>
    this.merge(pubkeys.map(pubkey => this.PubkeyInbox(pubkey)))

  Event = (event: TrustedEvent) =>
    this.FromRelays(this.getRelaysForPubkey(event.pubkey, RelayMode.Write))

  EventChildren = (event: TrustedEvent) =>
    this.FromRelays(this.getRelaysForPubkey(event.pubkey, RelayMode.Read))

  EventAncestors = (event: TrustedEvent, type: "mentions" | "replies" | "roots") => {
    return this.scenario(
      getAncestorTags(event.tags)[type].flatMap(
        ([_, value, relay, pubkey]) => {
          const selections = [makeSelection(this.ForUser().getUrls(), 0.5)]

          if (pubkey) {
            selections.push(makeSelection(this.FromPubkey(pubkey).getUrls()))
          }

          if (relay) {
            selections.push(makeSelection([relay], 0.9))
          }

          return selections
        }
      )
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
}

export class RouterScenario {
  constructor(readonly router: Router, readonly selections: Selection[], readonly options: RouterScenarioOptions = {}) {}

  clone = (options: RouterScenarioOptions) =>
    new RouterScenario(this.router, this.selections, {...this.options, ...options})

  filter = (f: (selection: Selection) => boolean) =>
    new RouterScenario(this.router, this.selections.filter(selection => f(selection)), this.options)

  update = (f: (selection: Selection) => Selection) =>
    new RouterScenario(this.router, this.selections.map(selection => f(selection)), this.options)

  policy = (policy: FallbackPolicy) => this.clone({policy})

  limit = (limit: number) => this.clone({limit})

  weight = (scale: number) =>
    this.update(selection => ({...selection, weight: selection.weight * scale}))

  getPolicy = () => this.options.policy || addMaximalFallbacks

  getLimit = () => this.options.limit || this.router.options.getLimit?.() || 10

  getUrls = () => {
    const limit = this.getLimit()
    const fallbackPolicy = this.getPolicy()
    const relayWeights = new Map<string, number>()

    for (const {weight, relays} of this.selections) {
      for (const relay of relays) {
        if (!isShareableRelayUrl(relay)) {
          continue
        }

        relayWeights.set(relay, add(weight, relayWeights.get(relay)))
      }
    }

    const scoreRelay = (relay: string) => {
      const quality = this.router.options.getRelayQuality?.(relay) || 1
      const weight = relayWeights.get(relay)!

      return -(quality * weight)
    }

    const relays = take(
      limit,
      sortBy(
        scoreRelay,
        Array.from(relayWeights.keys())
          .filter(scoreRelay)
      )
    )

    const fallbacksNeeded = fallbackPolicy(relays.length, limit)
    const allFallbackRelays = this.router.options.getFallbackRelays()
    const fallbackRelays = shuffle(allFallbackRelays).slice(0, fallbacksNeeded)

    for (const fallbackRelay of fallbackRelays) {
      relays.push(fallbackRelay)
    }

    return relays
  }

  getUrl = () => first(this.getUrls())
}

// Default router options

export const getRelayQuality = (url: string) => {
  const oneMinute = 60 * 1000
  const oneHour = 60 * oneMinute
  const oneDay = 24 * oneHour
  const oneWeek = 7 * oneDay
  const relay = relaysByUrl.get().get(url)
  const connect_count = relay?.stats?.connect_count || 0
  const recent_errors = relay?.stats?.recent_errors || []
  const connection = ctx.net.pool.get(url, {autoConnect: false})

  // If we haven't connected, consult our relay record and see if there has
  // been a recent fault. If there has been, penalize the relay. If there have been several,
  // don't use the relay.
  if (!connection) {
    const lastFault = last(recent_errors) || 0

    if (recent_errors.filter(n => n > now() - oneHour).length > 10) {
      return 0
    }

    if (recent_errors.filter(n => n > now() - oneDay).length > 50) {
      return 0
    }

    if (recent_errors.filter(n => n > now() - oneWeek).length > 100) {
      return 0
    }

    return Math.max(0, Math.min(0.5, (now() - oneMinute - lastFault) / oneHour))
  }

  const authScore = switcher(connection.auth.status, {
    [AuthStatus.Forbidden]: 0,
    [AuthStatus.Ok]: 1,
    default: 0.5,
  })

  const connectionScore = switcher(connection.meta.getStatus(), {
    [ConnectionStatus.Error]: 0,
    [ConnectionStatus.Closed]: 0.6,
    [ConnectionStatus.Slow]: 0.5,
    [ConnectionStatus.Ok]: 1,
    default: clamp([0.5, 1], connect_count / 1000),
  })

  return authScore * connectionScore
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

export const getIndexerRelays = () => ctx.app.indexerRelays || getFallbackRelays()

export const getFallbackRelays = throttleWithValue(300, () =>
  sortBy(r => -getRelayQuality(r.url), relays.get())
    .slice(0, 30)
    .map(r => r.url)
)

export const getSearchRelays = throttleWithValue(300, () =>
  sortBy(r => -getRelayQuality(r.url), relays.get())
    .filter(r => r.profile?.supported_nips?.includes(50))
    .slice(0, 30)
    .map(r => r.url)
)

export const makeRouter = (options: Partial<RouterOptions> = {}) =>
  new Router({
    getPubkeyRelays,
    getIndexerRelays,
    getFallbackRelays,
    getSearchRelays,
    getRelayQuality,
    getUserPubkey: () => pubkey.get(),
    getLimit: () => 5,
    ...options,
  })

// Infer relay selections from filters

type FilterScenario = {filter: Filter, scenario: RouterScenario}

type FilterSelectionRule = (filter: Filter) => FilterScenario[]

export const getFilterSelectionsForLocalRelay = (filter: Filter) =>
 [{filter, scenario: ctx.app.router.FromRelays([LOCAL_RELAY_URL])}]

export const getFilterSelectionsForSearch = (filter: Filter) => {
  if (!filter.search) return []

  const relays = ctx.app.router.options.getSearchRelays?.() || []

  return [{filter, scenario: ctx.app.router.FromRelays(relays).weight(10)}]
}

export const getFilterSelectionsForWraps = (filter: Filter) => {
  if (!filter.kinds?.includes(WRAP) || filter.authors) return []

  return [{
    filter: {...filter, kinds: [WRAP]},
    scenario: ctx.app.router.UserInbox(),
  }]
}

export const getFilterSelectionsForIndexedKinds = (filter: Filter) => {
  const kinds = intersection(INDEXED_KINDS, filter.kinds || [])

  if (kinds.length === 0) return []

  const relays = ctx.app.router.options.getIndexerRelays?.() || []

  return [{
    filter: {...filter, kinds},
    scenario: ctx.app.router.FromRelays(relays),
  }]
}

export const getFilterSelectionsForAuthors = (filter: Filter) => {
  if (!filter.authors) return []

  const chunkCount = clamp([1, 4], Math.round(filter.authors.length / 50))

  return chunks(chunkCount, filter.authors)
    .map(authors => ({
      filter: {...filter, authors},
      scenario: ctx.app.router.FromPubkeys(authors),
    }))
}

export const getFilterSelectionsForUser = (filter: Filter) =>
  [{filter, scenario: ctx.app.router.ForUser().weight(0.5)}]

export const defaultFilterSelectionRules = [
  getFilterSelectionsForLocalRelay,
  getFilterSelectionsForSearch,
  getFilterSelectionsForWraps,
  getFilterSelectionsForIndexedKinds,
  getFilterSelectionsForAuthors,
  getFilterSelectionsForUser,
]

export function* getFilterSelections(filters: Filter[], rules: FilterSelectionRule[] = defaultFilterSelectionRules) {
  const filtersById = new Map<string, Filter>()
  const scenariosById = new Map<string, RouterScenario[]>()

  for (const filter of filters) {
    for (const filterScenario of rules.flatMap(rule => rule(filter))) {
      const id = getFilterId(filterScenario.filter)

      filtersById.set(id, filterScenario.filter)
      pushToMapKey(scenariosById, id, filterScenario.scenario)
    }
  }

  for (const [id, filter] of filtersById.entries()) {
    const scenario = ctx.app.router.merge(scenariosById.get(id) || [])
    const result = {filters: [filter], relays: scenario.getUrls()} as RelaysAndFilters

    yield result
  }
}
