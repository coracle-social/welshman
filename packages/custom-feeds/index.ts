import {inc, now, isNil} from '@coracle.social/lib'
import type {Rumor, Filter} from '@coracle.social/util'
import {Tags, getIdFilters, mergeFilters} from '@coracle.social/util'

// TODO:
// - if one of the feeds in a union is a filter, don't execute it,
//   use it to filter down results from other feeds
// - if multiple feeds in a composite are or result in filters (like lists, lols),
//   merge them before executing the request

export enum FeedType {
  Difference = "\\",
  Intersection = "∩",
  SymmetricDifference = "Δ",
  Union = "∪",
  Filter = "filter",
  List = "list",
  LOL = "lol",
  DVM = "dvm",
}

export enum Scope {
  User = "user",
  Follows = "follows",
  Followers = "followers",
}

export type WotRange = 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1

export type DynamicFilter = Filter & {
  scopes?: Scope[]
  min_wot?: WotRange
  max_wot?: WotRange
  until_ago?: number
  since_ago?: number
}

export type DVMRequest = {
  kind: number
  input?: string
  pubkey?: string
}

export type DifferenceFeed = [FeedType.Difference, ...Feed[]]
export type IntersectionFeed = [FeedType.Intersection, ...Feed[]]
export type SymmetricDifferenceFeed = [FeedType.SymmetricDifference, ...Feed[]]
export type UnionFeed = [FeedType.Union, ...Feed[]]
export type FilterFeed = [FeedType.Filter, ...DynamicFilter[]]
export type DVMFeed = [FeedType.DVM, ...DVMRequest[]]
export type ListFeed = [FeedType.List, ...string[]]
export type LOLFeed = [FeedType.LOL, ...string[]]

export type Feed = DifferenceFeed | IntersectionFeed | SymmetricDifferenceFeed | UnionFeed | FilterFeed | ListFeed | LOLFeed | DVMFeed

export const difference = (...feeds: Feed[]) => [FeedType.Difference, ...feeds]

export const intersection = (...feeds: Feed[]) => [FeedType.Intersection, ...feeds]

export const symmetricDifference = (...feeds: Feed[]) => [FeedType.SymmetricDifference, ...feeds]

export const union = (...feeds: Feed[]) => [FeedType.Union, ...feeds]

export const filter = (...filters: DynamicFilter[]) => [FeedType.Filter, ...filters]

export const list = (...addresses: string[]) => [FeedType.List, ...addresses]

export const lol = (...addresses: string[]) => [FeedType.LOL, ...addresses]

export const dvm = (...requests: DVMRequest[]) => [FeedType.DVM, ...requests]

export type InterpreterOpts = {
  reqDvm: (request: DVMRequest, opts: ExecuteOpts) => void
  reqFilters: (filters: Filter[], opts: ExecuteOpts) => void
  getPubkeysForScope: (scope: Scope) => string[]
  getPubkeysForWotRange: (minWot: number, maxWot: number) => string[]
}

export type ExecuteOpts = {
  onEvent: (event: Rumor) => void
  onComplete?: () => void
}

export class Interpreter {
  constructor(readonly opts: InterpreterOpts) {}

  // Dispatch to different types of feed

  execute([type, ...feed]: Feed, opts: ExecuteOpts) {
    switch(type) {
      case FeedType.Difference:
        return this._executeDifference(feed as Feed[], opts)
      case FeedType.Intersection:
        return this._executeIntersection(feed as Feed[], opts)
      case FeedType.SymmetricDifference:
        return this._executeSymmetricDifference(feed as Feed[], opts)
      default:
        return this._feedToFilters([type, ...feed] as Feed).then(filters =>
          this.opts.reqFilters(filters.map(this._compileFilter), opts)
        )
    }
  }

  async _feedToFilters([type, ...feed]: Feed) {
    switch(type) {
      case FeedType.Union:
        return await this._unionToFilters(feed as Feed[])
      case FeedType.List:
        return await this._listsToFilters(feed as string[])
      case FeedType.LOL:
        return await this._lolsToFilters(feed as string[])
      case FeedType.DVM:
        return await this._dvmsToFilters(feed as DVMRequest[])
      case FeedType.Filter:
        return feed as Filter[]
      default:
        throw new Error(`Unable to convert feed of type ${type} to filters`)
    }
  }

  async _feedsToFilters(feeds: Feed[]) {
    const filters: Filter[] = []

    await Promise.all(
      feeds.map(async feed => {
        for (const filter of await this._feedToFilters(feed)) {
          filters.push(this._compileFilter(filter))
        }
      })
    )

    return filters
  }

  // Special-case executors for set operations we can't infer filters for

  async _executeDifference(feeds: Feed[], {onEvent, onComplete}: ExecuteOpts) {
    const skip = new Set<string>()
    const events: Rumor[] = []

    feeds.forEach((subFeed: Feed, i: number) => {
      this.execute(subFeed, {
        onEvent: (event: Rumor) => {
          if (i === 0) {
            events.push(event)
          } else {
            skip.add(event.id)
          }
        },
        onComplete: () => {
          for (const event of events) {
            if (!skip.has(event.id)) {
              onEvent(event)
            }

            onComplete?.()
          }
        },
      })
    })
  }

  async _executeIntersection(feeds: Feed[], {onEvent, onComplete}: ExecuteOpts) {
    const counts = new Map<string, number>()
    const events = new Map<string, Rumor>()

    feeds.forEach((subFeed: Feed, i: number) => {
      this.execute(subFeed, {
        onEvent: (event: Rumor) => {
          events.set(event.id, event)
          counts.set(event.id, inc(counts.get(event.id)))
        },
        onComplete: () => {
          for (const event of events.values()) {
            if (counts.get(event.id) === feeds.length) {
              onEvent(event)
            }

            onComplete?.()
          }
        },
      })
    })
  }

  async _executeSymmetricDifference(feeds: Feed[], {onEvent, onComplete}: ExecuteOpts) {
    const counts = new Map<string, number>()
    const events = new Map<string, Rumor>()

    feeds.forEach((subFeed: Feed, i: number) => {
      this.execute(subFeed, {
        onEvent: (event: Rumor) => {
          events.set(event.id, event)
          counts.set(event.id, inc(counts.get(event.id)))
        },
        onComplete: () => {
          for (const event of events.values()) {
            if (counts.get(event.id) === 1) {
              onEvent(event)
            }

            onComplete?.()
          }
        },
      })
    })
  }

  // Everything else can be compiled to filters

  async _unionToFilters(feeds: Feed[]): Promise<Filter[]> {
    return mergeFilters(await this._feedsToFilters(feeds))
  }

  async _listsToFilters(addresses: string[]): Promise<Filter[]> {
    return new Promise(resolve => {
      const events: Rumor[] = []

      this.opts.reqFilters(getIdFilters(addresses), {
        onEvent: (event: Rumor) => events.push(event),
        onComplete: () => resolve(this._getFiltersFromTags(Tags.fromEvents(events))),
      })
    })
  }

  async _lolsToFilters(addresses: string[]): Promise<Filter[]> {
    return new Promise(resolve => {
      const events: Rumor[] = []

      this.opts.reqFilters(getIdFilters(addresses), {
        onEvent: (event: Rumor) => events.push(event),
        onComplete: () => resolve(this._listsToFilters(Tags.fromEvents(events).values("a").valueOf())),
      })
    })
  }

  async _dvmsToFilters(requests: DVMRequest[]): Promise<Filter[]> {
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

    if ((!isNil(min_wot) || !isNil(max_wot)) && !filter.authors) {
      filter.authors = this.opts.getPubkeysForWotRange(min_wot || 1, max_wot || 1)
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
