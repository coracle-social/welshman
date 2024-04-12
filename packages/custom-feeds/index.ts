import {inc, now, isNil} from '@coracle.social/lib'
import type {Rumor, Filter} from '@coracle.social/util'
import {Tags, getIdFilters, mergeFilters} from '@coracle.social/util'

export enum FeedType {
  Union = "union",
  Filter = "filter",
  List = "list",
  LOL = "lol",
  DVM = "dvm",
}

export enum Scope {
  Self = "self",
  Follows = "follows",
  Followers = "followers",
}

export type DynamicFilter = Filter & {
  scopes?: Scope[]
  min_wot?: number
  max_wot?: number
  until_ago?: number
  since_ago?: number
}

export type DVMRequest = {
  kind: number
  tags?: string[][]
}

export type UnionFeed = [FeedType.Union, ...Feed[]]
export type FilterFeed = [FeedType.Filter, ...DynamicFilter[]]
export type ListFeed = [FeedType.List, ...string[]]
export type LOLFeed = [FeedType.LOL, ...string[]]
export type DVMFeed = [FeedType.DVM, ...DVMRequest[]]

export type Feed = UnionFeed | FilterFeed | ListFeed | LOLFeed | DVMFeed

export const union = (...feeds: Feed[]) =>
  [FeedType.Union, ...feeds] as UnionFeed
export const filter = (...filters: DynamicFilter[]) =>
  [FeedType.Filter, ...filters] as FilterFeed
export const list = (...addresses: string[]) =>
  [FeedType.List, ...addresses] as ListFeed
export const lol = (...addresses: string[]) =>
  [FeedType.LOL, ...addresses] as LOLFeed
export const dvm = (...requests: DVMRequest[]) =>
  [FeedType.DVM, ...requests] as DVMFeed

export type ExecuteOpts = {
  onEvent: (event: Rumor) => void
  onComplete?: () => void
}

export type FeedCompilerOpts = {
  reqDvm: (request: DVMRequest, opts: ExecuteOpts) => void
  reqFilters: (filters: Filter[], opts: ExecuteOpts) => void
  getPubkeysForScope: (scope: Scope) => string[]
  getPubkeysForWotRange: (minWot: number, maxWot: number) => string[]
}

export class FeedCompiler {
  constructor(readonly opts: FeedCompilerOpts) {}

  // Dispatch to different types of feed

  execute(feed: Feed, opts: ExecuteOpts) {
    return this.compile(feed).then(filters =>
      this.opts.reqFilters(filters, opts)
    )
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

  // Everything can be compiled to filters

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
    return new Promise(resolve => {
      const events: Rumor[] = []

      this.opts.reqFilters(getIdFilters(addresses), {
        onEvent: (event: Rumor) =>events.push(event),
        onComplete: () => resolve(this._getFiltersFromTags(Tags.fromEvents(events))),
      })
    })
  }

  async _compileLols(addresses: string[]): Promise<Filter[]> {
    return new Promise(resolve => {
      const events: Rumor[] = []

      this.opts.reqFilters(getIdFilters(addresses), {
        onEvent: (event: Rumor) => events.push(event),
        onComplete: () => resolve(this._compileLists(Tags.fromEvents(events).values("a").valueOf())),
      })
    })
  }

  async _compileDvms(requests: DVMRequest[]): Promise<Filter[]> {
    const events: Rumor[] = []

    await Promise.all(
      requests.map(request => {
        return new Promise<void>(resolve => {
          this.opts.reqDvm(request, {
            onEvent: (event: Rumor) => events.push(event),
            onComplete: resolve,
          })
        })
      })
    )

    return this._getFiltersFromTags(Tags.fromEvents(events))
  }

  // Utilities

  _getCompletionTracker(onComplete?: () => void) {
    let pending = 0

    return () => {
      pending += 1

      return () => {
        pending -= 1

        if (pending === 0) {
          onComplete?.()
        }
      }
    }
  }

  _compileFilter({scopes, min_wot, max_wot, until_ago, since_ago, ...filter}: DynamicFilter) {
    if (scopes && !filter.authors) {
      filter.authors = scopes.flatMap(scope => this.opts.getPubkeysForScope(scope))
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
