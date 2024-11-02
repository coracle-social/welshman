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
  weight: number
}

// Fallback policies

export type FallbackPolicy = (count: number, limit: number) => number

export const addNoFallbacks = (count: number, redundancy: number) => 0

export const addMinimalFallbacks = (count: number, redundancy: number) => (count > 0 ? 0 : 1)

export const addMaximalFallbacks = (count: number, redundancy: number) => redundancy - count

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

  // Utilities for creating ValueRelays

  selection = (value: string, relays: Iterable<string>, weight = 1): ValueRelays =>
    ({value, relays: Array.from(relays), weight})

  // Utilities for processing hints

  relaySelectionsFromMap = (valuesByRelay: ValuesByRelay) =>
    sortBy(
      ({values}) => -values.length,
      Array.from(valuesByRelay).map(([relay, values]: [string, string[]]) => ({
        relay,
        values: uniq(values),
      }))
    )

  scoreRelaySelection = ({values, relay, weight}: RelayValues) =>
    values.length * (this.options.getRelayQuality?.(relay) || 1) * weight

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

  // Routing scenarios


  FromRelays = (relays: string[], id = "") =>
    this.scenario([this.selection(id, relays)])

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
    this.FromRelays(this.getRelaysForPubkey(event.pubkey, RelayMode.Write), event.id)

  EventChildren = (event: TrustedEvent) =>
    this.FromRelays(this.getRelaysForPubkey(event.pubkey, RelayMode.Read), event.id)

  EventAncestors = (event: TrustedEvent, type: "mentions" | "replies" | "roots") => {
    return this.scenario(
      getAncestorTags(event.tags)[type].flatMap(
        ([_, value, relay, pubkey]) => {
          const tagScenarios = [this.selection(value, this.ForUser().getUrls(), 0.5)]

          if (pubkey) {
            tagScenarios.push(this.selection(value, this.FromPubkey(pubkey).getUrls()))
          }

          if (relay) {
            tagScenarios.push(this.selection(value, [relay], 0.9))
          }

          return tagScenarios
        }
      )
    )
  }

  EventMentions = (event: TrustedEvent) => this.EventAncestors(event, "mentions")

  EventParents = (event: TrustedEvent) => this.EventAncestors(event, "replies")

  EventRoots = (event: TrustedEvent) => this.EventAncestors(event, "roots")

  PublishEvent = (event: TrustedEvent) => {
    const pubkeys = getPubkeyTagValues(event.tags)

    return this.scenario([
      this.selection(event.id, this.FromPubkey(event.pubkey).getUrls()),
      ...pubkeys.map(pubkey => this.selection(event.id, this.ForPubkey(event.pubkey).getUrls(), 0.5)),
    ])
  }
}

// Router Scenario

export type RouterScenarioOptions = {
  redundancy?: number
  policy?: FallbackPolicy
  limit?: number
}

export class RouterScenario {
  constructor(
    readonly router: Router,
    readonly selections: ValueRelays[],
    readonly options: RouterScenarioOptions = {}
  ) {}

  clone = (options: RouterScenarioOptions) =>
    new RouterScenario(this.router, this.selections, {...this.options, ...options})

  filter = (f: (selection: ValueRelays) => boolean) =>
    new RouterScenario(
      this.router,
      this.selections.filter(selection => f(selection)),
      this.options
    )

  update = (f: (selection: ValueRelays) => ValueRelays) =>
    new RouterScenario(
      this.router,
      this.selections.map(selection => f(selection)),
      this.options
    )

  redundancy = (redundancy: number) => this.clone({redundancy})

  policy = (policy: FallbackPolicy) => this.clone({policy})

  limit = (limit: number) => this.clone({limit})

  getRedundancy = () => this.options.redundancy || this.router.options.getRedundancy?.() || 3

  getPolicy = () => this.options.policy || addMaximalFallbacks

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
    const adjustedRedundancy = Math.max(
      redundancy,
      redundancy * (limit / (allValues.size * redundancy))
    )

    const seen = new Map<string, number>()
    const result: ValuesByRelay = new Map()
    const relaySelections = this.router.relaySelectionsFromMap(valuesByRelay)
    for (const {relay} of this.router.sortRelaySelections(relaySelections)) {
      const values = new Set<string>()
      for (const value of uniq(valuesByRelay.get(relay) || [])) {
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
      target.values = uniq(
        discard.concat(target).flatMap((selection: RelayValues) => selection.values)
      )
    }

    return keep
  }

  getUrls = () => this.getSelections().map((selection: RelayValues) => selection.relay)

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
    getRedundancy: () => 2,
    getLimit: () => 5,
    ...options,
  })

// Infer relay selections from filters

export type FilterSelection = {
  id: string
  filter: Filter
  scenario: RouterScenario
}

type FilterSelectionRuleState = {
  filter: Filter
  selections: FilterSelection[]
}

type FilterSelectionRule = (state: FilterSelectionRuleState) => boolean

export const makeFilterSelection = (id: string, filter: Filter, scenario: RouterScenario) => ({
  id,
  filter,
  scenario,
})

export const getFilterSelectionsForLocalRelay = (state: FilterSelectionRuleState) => {
  const id = getFilterId(state.filter)
  const scenario = ctx.app.router.FromRelays([LOCAL_RELAY_URL], id)

  state.selections.push(makeFilterSelection(id, state.filter, scenario))

  return false
}

export const getFilterSelectionsForSearch = (state: FilterSelectionRuleState) => {
  if (!state.filter.search) return false

  const id = getFilterId(state.filter)
  const relays = ctx.app.router.options.getSearchRelays?.() || []
  const scenario = ctx.app.router.FromRelays(relays, id)

  state.selections.push(makeFilterSelection(id, state.filter, scenario))

  return true
}

export const getFilterSelectionsForWraps = (state: FilterSelectionRuleState) => {
  if (!state.filter.kinds?.includes(WRAP) || state.filter.authors) return false

  const id = getFilterId({...state.filter, kinds: [WRAP]})
  const scenario = ctx.app.router.UserInbox().update(assoc('value', id))

  state.selections.push(makeFilterSelection(id, state.filter, scenario))

  return false
}

export const getFilterSelectionsForIndexedKinds = (state: FilterSelectionRuleState) => {
  const kinds = intersection(INDEXED_KINDS, state.filter.kinds || [])

  if (kinds.length === 0) return false

  const id = getFilterId({...state.filter, kinds})
  const relays = ctx.app.router.options.getIndexerRelays?.() || []
  const scenario = ctx.app.router.FromRelays(relays, id)

  state.selections.push(makeFilterSelection(id, state.filter, scenario))

  return false
}

export const getFilterSelectionsForAuthors = (state: FilterSelectionRuleState) => {
  // If we have a ton of authors, just use our indexers
  if (!state.filter.authors) return false

  const id = getFilterId(state.filter)
  const pubkeys = sample(50, state.filter.authors!)
  const scenario = ctx.app.router.FromPubkeys(pubkeys).update(assoc("value", id))

  state.selections.push(makeFilterSelection(id, state.filter, scenario))

  return false
}

export const getFilterSelectionsForUser = (state: FilterSelectionRuleState) => {
  const id = getFilterId(state.filter)
  const relays = ctx.app.router.ForUser().getUrls()
  const scenario = ctx.app.router.FromRelays(relays, id)

  state.selections.push(makeFilterSelection(id, state.filter, scenario))

  return false
}

export const defaultFilterSelectionRules = [
  getFilterSelectionsForLocalRelay,
  getFilterSelectionsForSearch,
  getFilterSelectionsForWraps,
  getFilterSelectionsForIndexedKinds,
  getFilterSelectionsForAuthors,
  getFilterSelectionsForUser,
]

export const getFilterSelections = (
  filters: Filter[],
  rules: FilterSelectionRule[] = defaultFilterSelectionRules
): RelaysAndFilters[] => {
  const scenarios: RouterScenario[] = []
  const filtersById = new Map<string, Filter>()

  for (const filter of filters) {
    const state: FilterSelectionRuleState = {filter, selections: []}

    for (const rule of rules) {
      const done = rule(state)

      if (done) {
        break
      }
    }

    for (const {id, filter, scenario} of state.selections) {
      filtersById.set(id, filter)
      scenarios.push(scenario.policy(addNoFallbacks))
    }
  }

  // Use low redundancy because filters will be very low cardinality
  const selections = ctx.app.router
    .merge(scenarios)
    .redundancy(1)
    .getSelections()
    .map(({values, relay}) => ({
      filters: values.map(id => filtersById.get(id)!),
      relays: [relay],
    }))

  // Pubkey-based selections can get really big. Use the most popular relays for the long tail
  const limit = ctx.app.router.options.getLimit?.() || 8
  const redundancy = ctx.app.router.options.getRedundancy?.() || 3
  const [keep, discard] = splitAt(limit, selections)

  for (const target of keep.slice(0, redundancy)) {
    target.filters = unionFilters([...discard, target].flatMap(s => s.filters))
  }

  return keep
}
