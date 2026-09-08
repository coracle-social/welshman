import {uniq, without} from "@welshman/lib"
import type {MaybeAsync} from "@welshman/lib"
import {normalizeRelayUrl, inboxes, outbox, relay} from "@welshman/util"
import type {Filter, RelaySelection, RelayScenario} from "@welshman/util"
import type {KindContext} from "./Kind.js"

// A filter field is either absent (unconstrained) or an array, an empty array
// included, which matches nothing. Adding no values leaves the field as it was.
const addValues = (current: string[] | undefined, values: string[]) =>
  values.length > 0 ? uniq([...(current ?? []), ...values]) : current

const removeValues = (current: string[] | undefined, values: string[]) =>
  current && without(values, current)

// Tag filter keys are stored bare ("e") and rendered prefixed ("#e"), so callers
// may pass either.
const tagKey = (key: string) => (key.startsWith("#") ? key.slice(1) : key)

/**
 * The read-side counterpart to `EventWriter`: a chainable builder for the filters
 * that fetch a kind's events, plus the relays to request them from. The kind comes
 * from the factory; each subclass implements `renderRoutes` to say where its
 * events live, and adds any domain-specific methods (e.g. `CommentQuery.forRoot`).
 */
export abstract class EventQuery {
  ids?: string[]
  authors?: string[]
  since?: number
  until?: number
  limit?: number
  search?: string
  tagValues = new Map<string, string[]>()
  forcedRoutes?: RelaySelection[]
  extraRoutes: RelaySelection[] = []

  constructor(
    readonly kind: number,
    readonly context: KindContext,
  ) {}

  setIds(ids: string[]) {
    this.ids = ids

    return this
  }

  addIds(ids: string[]) {
    this.ids = addValues(this.ids, ids)

    return this
  }

  removeIds(ids: string[]) {
    this.ids = removeValues(this.ids, ids)

    return this
  }

  clearIds() {
    this.ids = undefined

    return this
  }

  setAuthors(authors: string[]) {
    this.authors = authors

    return this
  }

  addAuthors(authors: string[]) {
    this.authors = addValues(this.authors, authors)

    return this
  }

  removeAuthors(authors: string[]) {
    this.authors = removeValues(this.authors, authors)

    return this
  }

  clearAuthors() {
    this.authors = undefined

    return this
  }

  setTag(key: string, values: string[]) {
    this.tagValues.set(tagKey(key), values)

    return this
  }

  addTag(key: string, values: string[]) {
    const k = tagKey(key)
    const next = addValues(this.tagValues.get(k), values)

    if (next) {
      this.tagValues.set(k, next)
    }

    return this
  }

  removeTag(key: string, values: string[]) {
    const k = tagKey(key)
    const next = removeValues(this.tagValues.get(k), values)

    if (next) {
      this.tagValues.set(k, next)
    }

    return this
  }

  clearTag(key: string) {
    this.tagValues.delete(tagKey(key))

    return this
  }

  clearTags() {
    this.tagValues.clear()

    return this
  }

  setSince(since: number) {
    this.since = since

    return this
  }

  clearSince() {
    this.since = undefined

    return this
  }

  setUntil(until: number) {
    this.until = until

    return this
  }

  clearUntil() {
    this.until = undefined

    return this
  }

  setLimit(limit: number) {
    this.limit = limit

    return this
  }

  clearLimit() {
    this.limit = undefined

    return this
  }

  setSearch(search: string) {
    this.search = search

    return this
  }

  clearSearch() {
    this.search = undefined

    return this
  }

  // NIP-29 room events live on one relay and are scoped by their `h` tag.
  setRoom(url: string, room: string) {
    this.forcedRoutes = [relay(normalizeRelayUrl(url))]

    return this.setTag("h", [room])
  }

  clearRoom() {
    this.forcedRoutes = undefined

    return this.clearTag("h")
  }

  /**
   * Replaces the rendered routes. These are routes rather than urls, so
   * `setRoutes([userInbox()])` asks the user's read relays without resolving them
   * first.
   */
  setRoutes(routes: RelaySelection[]) {
    this.forcedRoutes = routes

    return this
  }

  /**
   * Adds routes alongside the rendered ones.
   */
  addRoutes(routes: RelaySelection[]) {
    this.extraRoutes = [...this.extraRoutes, ...routes]

    return this
  }

  clearRoutes() {
    this.forcedRoutes = undefined
    this.extraRoutes = []

    return this
  }

  /**
   * Returns the filter fields that may be set on any kind.
   */
  protected renderBaseFilter(): MaybeAsync<Filter> {
    const filter: Record<string, any> = {kinds: [this.kind]}

    if (this.ids) filter.ids = this.ids
    if (this.authors) filter.authors = this.authors
    if (this.since !== undefined) filter.since = this.since
    if (this.until !== undefined) filter.until = this.until
    if (this.limit !== undefined) filter.limit = this.limit
    if (this.search !== undefined) filter.search = this.search

    for (const [key, values] of this.tagValues) {
      filter[`#${key}`] = values
    }

    return filter as Filter
  }

  /**
   * Returns one filter per kind-specific variant. A relay ANDs a filter's fields
   * together, so alternative references go in separate filters.
   */
  protected renderDomainFilters(): MaybeAsync<Filter[]> {
    return [{}]
  }

  /**
   * Returns the complete filter list for requesting.
   */
  async renderFilters(): Promise<Filter[]> {
    const baseFilter = await this.renderBaseFilter()
    const domainFilters = await this.renderDomainFilters()

    return domainFilters.map(filter => ({...baseFilter, ...filter}))
  }

  /**
   * Returns the outboxes of the authors being queried.
   */
  protected authorRoutes(weight = 1): RelaySelection[] {
    return (this.authors ?? []).map(pubkey => outbox(pubkey, weight))
  }

  /**
   * Returns the inboxes of the pubkeys this query filters on by `p` tag — where
   * events addressed to them are delivered.
   */
  protected mentionRoutes(weight = 0.5): RelaySelection[] {
    return inboxes(this.tagValues.get("p") ?? [], weight)
  }

  /**
   * Returns the list of routes this query should be sent to. Every kind implements
   * this itself; there is no default.
   */
  protected abstract renderRoutes(): MaybeAsync<RelaySelection[]>

  /**
   * Returns a router scenario for this query. Requests the routes given to
   * `setRoutes` when set, otherwise the rendered ones; either way `addRoutes`
   * contributes on top.
   */
  async scenario(): Promise<RelayScenario> {
    const routes = this.forcedRoutes?.length ? this.forcedRoutes : await this.renderRoutes()

    return this.context.resolver.scenario([...routes, ...this.extraRoutes])
  }

  /**
   * Shortcut for getting relays from the router scenario.
   */
  async relays(): Promise<string[]> {
    return (await this.scenario()).getUrls()
  }

  /**
   * Returns rendered filters along with the relays to request them from.
   */
  async render(): Promise<{filters: Filter[]; relays: string[]}> {
    const [filters, relays] = await Promise.all([this.renderFilters(), this.relays()])

    return {filters, relays}
  }
}
