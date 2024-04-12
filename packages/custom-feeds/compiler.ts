import {inc, now, isNil} from '@coracle.social/lib'
import type {Rumor, Filter} from '@coracle.social/util'
import {Tags, getIdFilters, mergeFilters} from '@coracle.social/util'
import type {DVMRequest, Scope, Feed, DynamicFilter} from './core'
import {FeedType} from './core'

export type ExecuteOpts<E> = {
  onEvent: (event: E) => void
}

export type FeedCompilerOpts<E> = {
  reqDvm: (request: DVMRequest, opts: ExecuteOpts<E>) => Promise<void>
  reqFilters: (filters: Filter[], opts: ExecuteOpts<E>) => Promise<void>
  getPubkeysForScope: (scope: Scope) => string[]
  getPubkeysForWotRange: (minWot: number, maxWot: number) => string[]
}

export class FeedCompiler<E extends Rumor> {
  constructor(readonly opts: FeedCompilerOpts<E>) {}

  canCompile([type, ...feed]: Feed): boolean {
    switch(type) {
      case FeedType.Union:
        return (feed as Feed[]).every(this.canCompile)
      case FeedType.List:
      case FeedType.LOL:
      case FeedType.DVM:
      case FeedType.Filter:
        return true
      default:
        return false
    }
  }

  async compile([type, ...feed]: Feed) {
    switch(type) {
      case FeedType.Union:
        return await this._compileUnion(feed as Feed[])
      case FeedType.List:
        return await this._compileLists(feed as string[])
      case FeedType.LOL:
        return await this._compileLols(feed as string[])
      case FeedType.DVM:
        return await this._compileDvms(feed as DVMRequest[])
      case FeedType.Filter:
        return (feed as DynamicFilter[]).map(filter => this._compileFilter(filter))
      default:
        throw new Error(`Unable to convert feed of type ${type} to filters`)
    }
  }

  async _compileUnion(feeds: Feed[]): Promise<Filter[]> {
    const filters: Filter[] = []

    await Promise.all(
      feeds.map(async feed => {
        for (const filter of await this.compile(feed)) {
          filters.push(filter)
        }
      })
    )

    return mergeFilters(filters)
  }

  async _compileLists(addresses: string[]): Promise<Filter[]> {
    const events: E[] = []

    await this.opts.reqFilters(getIdFilters(addresses), {onEvent: events.push})

    return this._getFiltersFromTags(Tags.fromEvents(events))
  }

  async _compileLols(addresses: string[]): Promise<Filter[]> {
    const events: E[] = []

    await this.opts.reqFilters(getIdFilters(addresses), {onEvent: events.push})

    return this._compileLists(Tags.fromEvents(events).values("a").valueOf())
  }

  async _compileDvms(requests: DVMRequest[]): Promise<Filter[]> {
    const events: E[] = []

    await Promise.all(requests.map(request => this.opts.reqDvm(request, {onEvent: events.push})))

    return this._getFiltersFromTags(Tags.fromEvents(events))
  }

  // Utilities

  _compileFilter({scopes, min_wot, max_wot, until_ago, since_ago, ...filter}: DynamicFilter) {
    if (scopes && !filter.authors) {
      filter.authors = scopes.flatMap((scope: Scope) => this.opts.getPubkeysForScope(scope))
    }

    if ((!isNil(min_wot) || !isNil(max_wot))) {
      const authors = this.opts.getPubkeysForWotRange(min_wot || 0, max_wot || 1)

      if (filter.authors) {
        const authorsSet = new Set(authors)

        filter.authors = filter.authors.filter(pubkey => authorsSet.has(pubkey))
      } else {
        filter.authors = authors
      }
    }

    if (!isNil(until_ago)) {
      filter.until = now() - until_ago!
    }

    if (!isNil(since_ago)) {
      filter.since = now() - since_ago!
    }

    return filter as Filter
  }

  _getFiltersFromTags(tags: Tags) {
    const ttags = tags.values("t")
    const ptags = tags.values("p")
    const eatags = tags.filterByKey(["e", "a"]).values()
    const filters: Filter[] = []

    if (ttags.exists()) {
      filters.push({"#t": ttags.valueOf()})
    }

    if (ptags.exists()) {
      filters.push({authors: ptags.valueOf()})
    }

    if (eatags.exists()) {
      for (const filter of getIdFilters(eatags.valueOf())) {
        filters.push(filter)
      }
    }

    return filters
  }
}
