import {inc, now, isNil} from '@coracle.social/lib'
import type {Rumor, Filter} from '@coracle.social/util'
import {Tags, getIdFilters} from '@coracle.social/util'

// TODO:
// - if one of the feeds in a union is a filter, don't execute it,
//   use it to filter down results from other feeds
// - if multiple feeds in a composite are or result in filters (like lists, lols),
//   merge them before executing the request

export enum Operator {
  Difference = "\\",
  Intersection = "∩",
  SymmetricDifference = "Δ",
  Union = "∪",
}

export enum FeedType {
  Composite = "composite",
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

export type CompositeFeed = {
  type: FeedType.Composite
  operator: Operator
  feeds: Feed[]
}

export type FilterFeed = {
  type: FeedType.Filter
  filter: DynamicFilter
}

export type ListFeed = {
  type: FeedType.List
  address: string
}

export type LOLFeed = {
  type: FeedType.LOL
  address: string
}

export type DVMFeed = {
  type: FeedType.DVM
  kind: number
  input?: string
  pubkey?: string
}

export type Feed = CompositeFeed | FilterFeed | ListFeed | LOLFeed | DVMFeed

export const difference = (feeds: Feed[]) =>
  ({type: FeedType.Composite as FeedType.Composite, operator: Operator.Difference, feeds})

export const intersection = (feeds: Feed[]) =>
  ({type: FeedType.Composite as FeedType.Composite, operator: Operator.Intersection, feeds})

export const symmetricDifference = (feeds: Feed[]) =>
  ({type: FeedType.Composite as FeedType.Composite, operator: Operator.SymmetricDifference, feeds})

export const union = (feeds: Feed[]) =>
  ({type: FeedType.Composite as FeedType.Composite, operator: Operator.Union, feeds})

export const filter = (filter: DynamicFilter) =>
  ({type: FeedType.Filter as FeedType.Filter, filter})

export const list = (address: string) =>
  ({type: FeedType.List as FeedType.List, address})

export const lol = (address: string) =>
  ({type: FeedType.LOL as FeedType.LOL, address})

export const dvm = (kind: number, input?: string, pubkey?: string) =>
  ({type: FeedType.DVM as FeedType.DVM, kind, input, pubkey})

export type InterpreterOpts = {
  reqDvm: (feed: DVMFeed, opts: ExecuteOpts) => void
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

  execute(feed: Feed, opts: ExecuteOpts) {
    switch (feed.type) {
      case FeedType.Composite:
        switch (feed.operator) {
          case Operator.Difference: return this.executeDifference(feed, opts)
          case Operator.Intersection: return this.executeIntersection(feed, opts)
          case Operator.SymmetricDifference: return this.executeSymmetricDifference(feed, opts)
          case Operator.Union: return this.executeUnion(feed, opts)
        }
      case FeedType.Filter: return this.executeFilter(feed, opts)
      case FeedType.List: return this.executeList(feed, opts)
      case FeedType.LOL: return this.executeLOL(feed, opts)
      case FeedType.DVM: return this.executeDVM(feed, opts)
    }
  }

  executeDifference(feed: CompositeFeed, {onEvent, onComplete}: ExecuteOpts) {
    const skip = new Set<string>()
    const events: Rumor[] = []

    feed.feeds.forEach((subFeed: Feed, i: number) => {
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

  executeIntersection(feed: CompositeFeed, {onEvent, onComplete}: ExecuteOpts) {
    const counts = new Map<string, number>()
    const events = new Map<string, Rumor>()

    feed.feeds.forEach((subFeed: Feed, i: number) => {
      this.execute(subFeed, {
        onEvent: (event: Rumor) => {
          events.set(event.id, event)
          counts.set(event.id, inc(counts.get(event.id)))
        },
        onComplete: () => {
          for (const event of events.values()) {
            if (counts.get(event.id) === feed.feeds.length) {
              onEvent(event)
            }

            onComplete?.()
          }
        },
      })
    })
  }

  executeSymmetricDifference(feed: CompositeFeed, {onEvent, onComplete}: ExecuteOpts) {
    const counts = new Map<string, number>()
    const events = new Map<string, Rumor>()

    feed.feeds.forEach((subFeed: Feed, i: number) => {
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

  executeUnion(feed: CompositeFeed, {onEvent, onComplete}: ExecuteOpts) {
    const getOnComplete = this.#getCompletionTracker(onComplete)

    for (const subFeed of feed.feeds) {
      this.execute(subFeed, {onEvent, onComplete: getOnComplete})
    }
  }

  executeFilter(feed: FilterFeed, opts: ExecuteOpts) {
    this.opts.reqFilters([this.#compileFilter(feed.filter)], opts)
  }

  executeList(feed: ListFeed, {onEvent, onComplete}: ExecuteOpts) {
    const getOnComplete = this.#getCompletionTracker(onComplete)

    this.opts.reqFilters(getIdFilters([feed.address]), {
      onComplete: getOnComplete(),
      onEvent: (event: Rumor) => {
        this.opts.reqFilters(this.#getFiltersFromTags(Tags.fromEvent(event)), {
          onEvent,
          onComplete: getOnComplete(),
        })
      },
    })
  }

  executeLOL(feed: LOLFeed, {onEvent, onComplete}: ExecuteOpts) {
    const getOnComplete = this.#getCompletionTracker(onComplete)

    this.opts.reqFilters(getIdFilters([feed.address]), {
      onComplete: getOnComplete(),
      onEvent: (event: Rumor) => {
        const addresses = Tags.fromEvent(event).values("a").valueOf()

        this.opts.reqFilters(getIdFilters(addresses), {
          onComplete: getOnComplete(),
          onEvent: (event: Rumor) => {
            this.opts.reqFilters(this.#getFiltersFromTags(Tags.fromEvent(event)), {
              onEvent,
              onComplete: getOnComplete(),
            })
          },
        })
      },
    })
  }

  executeDVM(feed: DVMFeed, {onEvent, onComplete}: ExecuteOpts) {
    const getOnComplete = this.#getCompletionTracker(onComplete)

    this.opts.reqDvm(feed, {
      onComplete: getOnComplete(),
      onEvent: (event: Rumor) => {
        this.opts.reqFilters(this.#getFiltersFromTags(Tags.fromEvent(event)), {
          onEvent,
          onComplete: getOnComplete(),
        })
      },
    })
  }

  #getCompletionTracker(onComplete?: () => void) {
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

  #compileFilter({scopes, min_wot, max_wot, until_ago, since_ago, ...filter}: DynamicFilter) {
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

    return filter
  }

  #getFiltersFromTags(tags: Tags) {
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
