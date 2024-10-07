import {
  intersection, first, switcher, throttleWithValue, clamp, last, splitAt, identity, sortBy, uniq, shuffle,
  pushToMapKey, now, assoc, ctx,
} from '@welshman/lib'
import {
  Tags, getFilterId, unionFilters, isShareableRelayUrl, isCommunityAddress, isGroupAddress, isContextAddress,
  PROFILE, RELAYS, INBOX_RELAYS, FOLLOWS, LOCAL_RELAY_URL, WRAP,
} from '@welshman/util'
import type {TrustedEvent, Filter} from '@welshman/util'
import {ConnectionStatus} from '@welshman/net'
import type {RelaysAndFilters} from '@welshman/net'
import {pubkey} from './session'
import {relaySelectionsByPubkey, inboxRelaySelectionsByPubkey, getReadRelayUrls, getWriteRelayUrls, getRelayUrls} from './relaySelections'
import {relays, relaysByUrl} from './relays'

export const INDEXED_KINDS = [PROFILE, RELAYS, INBOX_RELAYS, FOLLOWS]

export enum RelayMode {
  Read = "read",
  Write = "write",
  Inbox = "inbox"
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
}

// Fallback policies

export type FallbackPolicy = (count: number, limit: number) => number

export const addNoFallbacks = (count: number, redundancy: number) => 0

export const addMinimalFallbacks = (count: number, redundancy: number) => count > 0 ? 0 : 1

export const addMaximalFallbacks = (count: number, redundancy: number) => redundancy - count

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

  InboxRelays = () => this.scenario(this.getUserSelections(RelayMode.Inbox)).policy(addNoFallbacks)

  Messages = (pubkeys: string[]) =>
    this.scenario([
      ...this.getUserSelections(),
      ...this.getPubkeySelections(pubkeys),
    ])

  PublishMessage = (pubkey: string) =>
    this.scenario([
      ...this.getUserSelections(RelayMode.Inbox),
      this.getPubkeySelection(pubkey, RelayMode.Inbox),
    ]).policy(addMinimalFallbacks)

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
    const pubkeys = tags.values("p").valueOf()
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
        .policy(addNoFallbacks)
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
      .policy(addNoFallbacks)

  WithinCommunity = (address: string) =>
    this.scenario(this.getContextSelections(Tags.wrap([["a", address]])))

  WithinContext = (address: string) => {
    if (isGroupAddress(address)) {
      return this.WithinGroup(address)
    }

    if (isCommunityAddress(address)) {
      return this.WithinCommunity(address)
    }

    throw new Error(`Unknown context ${address}`)
  }

  WithinMultipleContexts = (addresses: string[]) =>
    this.merge(addresses.map(this.WithinContext))

  Search = (term: string, relays: string[] = []) =>
    this.product([term], uniq(relays.concat(this.options.getSearchRelays?.() || [])))
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

  filter = (f: (selection: ValueRelays) => boolean) =>
    new RouterScenario(this.router, this.selections.filter(selection => f(selection)), this.options)

  update = (f: (selection: ValueRelays) => ValueRelays) =>
    new RouterScenario(this.router, this.selections.map(selection => f(selection)), this.options)

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
    const adjustedRedundancy = Math.max(redundancy, redundancy * (limit / (allValues.size * redundancy)))

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
      target.values = uniq(discard.concat(target).flatMap((selection: RelayValues) => selection.values))
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

  return switcher(connection.meta.getStatus(), {
    [ConnectionStatus.Unauthorized]: 0.5,
    [ConnectionStatus.Forbidden]: 0,
    [ConnectionStatus.Error]: 0,
    [ConnectionStatus.Closed]: 0.6,
    [ConnectionStatus.Slow]: 0.5,
    [ConnectionStatus.Ok]: 1,
    default: clamp([0.5, 1], connect_count / 1000),
  })
}

export const getPubkeyRelays = (pubkey: string, mode?: string) => {
  const $relaySelections = relaySelectionsByPubkey.get()
  const $inboxSelections = inboxRelaySelectionsByPubkey.get()

  switch (mode) {
    case RelayMode.Read:  return getReadRelayUrls($relaySelections.get(pubkey))
    case RelayMode.Write: return getWriteRelayUrls($relaySelections.get(pubkey))
    case RelayMode.Inbox: return getRelayUrls($inboxSelections.get(pubkey))
    default:              return getRelayUrls($relaySelections.get(pubkey))
  }
}

export const getIndexerRelays = () => ctx.app.indexerRelays || getFallbackRelays()

export const getFallbackRelays = throttleWithValue(300, () =>
  sortBy(r => -getRelayQuality(r.url), relays.get()).slice(0, 30).map(r => r.url)
)

export const getSearchRelays = throttleWithValue(300, () =>
  sortBy(r => -getRelayQuality(r.url), relays.get())
    .filter(r => r.profile?.supported_nips?.includes(50))
    .slice(0, 30).map(r => r.url)
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
  id: string,
  filter: Filter,
  scenario: RouterScenario
}

type FilterSelectionRuleState = {
  filter: Filter,
  selections: FilterSelection[]
}

type FilterSelectionRule = (state: FilterSelectionRuleState) => boolean

export const makeFilterSelection = (id: string, filter: Filter, scenario: RouterScenario) =>
  ({id, filter, scenario})

export const getFilterSelectionsForLocalRelay = (state: FilterSelectionRuleState) => {
  const id = getFilterId(state.filter)
  const scenario = ctx.app.router.product([id], [LOCAL_RELAY_URL])

  state.selections.push(makeFilterSelection(id, state.filter, scenario))

  return false
}

export const getFilterSelectionsForSearch = (state: FilterSelectionRuleState) => {
  if (!state.filter.search) return false

  const id = getFilterId(state.filter)
  const relays = ctx.app.router.options.getSearchRelays?.() || []
  const scenario = ctx.app.router.product([id], relays)

  state.selections.push(makeFilterSelection(id, state.filter, scenario))

  return true
}

export const getFilterSelectionsForContext = (state: FilterSelectionRuleState) => {
  const contexts = state.filter["#a"]?.filter(isContextAddress) || []

  if (contexts.length === 0) return false

  const scenario = ctx.app.router.WithinMultipleContexts(contexts)

  for (const {relay, values} of scenario.getSelections()) {
    const contextFilter = {...state.filter, "#a": Array.from(values)}
    const id = getFilterId(contextFilter)
    const scenario = ctx.app.router.product([id], [relay])

    state.selections.push(makeFilterSelection(id, contextFilter, scenario))
  }

  return true
}

export const getFilterSelectionsForWraps = (state: FilterSelectionRuleState) => {
  if (state.filter.kinds?.includes(WRAP) || !state.filter.authors) return false

  const id = getFilterId({...state.filter, kinds: [WRAP]})
  const scenario = ctx.app.router.InboxRelays().update(assoc('value', id))

  state.selections.push(makeFilterSelection(id, state.filter, scenario))

  return false
}

export const getFilterSelectionsForIndexedKinds = (state: FilterSelectionRuleState) => {
  const kinds = intersection(INDEXED_KINDS, state.filter.kinds || [])

  if (kinds.length === 0) return false

  const id = getFilterId({...state.filter, kinds})
  const relays = ctx.app.router.options.getIndexerRelays?.() || []
  const scenario = ctx.app.router.product([id], relays)

  state.selections.push(makeFilterSelection(id, state.filter, scenario))

  return false
}

export const getFilterSelectionsForAuthors = (state: FilterSelectionRuleState) => {
  // If we have a ton of authors, just use our indexers
  if (!state.filter.authors || state.filter.authors.length > 30) return false

  const id = getFilterId(state.filter)
  const scenario = ctx.app.router.FromPubkeys(state.filter.authors!).update(assoc('value', id))

  state.selections.push(makeFilterSelection(id, state.filter, scenario))

  return false
}

export const getFilterSelectionsForUser = (state: FilterSelectionRuleState) => {
  const id = getFilterId(state.filter)
  const relays = ctx.app.router.ReadRelays().getUrls()
  const scenario = ctx.app.router.product([id], relays)

  state.selections.push(makeFilterSelection(id, state.filter, scenario))

  return false
}

export const defaultFilterSelectionRules = [
  getFilterSelectionsForLocalRelay,
  getFilterSelectionsForSearch,
  getFilterSelectionsForContext,
  getFilterSelectionsForWraps,
  getFilterSelectionsForIndexedKinds,
  getFilterSelectionsForAuthors,
  getFilterSelectionsForUser,
]

export const getFilterSelections = (filters: Filter[], rules: FilterSelectionRule[] = defaultFilterSelectionRules): RelaysAndFilters[] => {
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
