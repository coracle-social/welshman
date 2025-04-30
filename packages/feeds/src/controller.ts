import {inc, defer, Deferred, memoize, omitVals, max, min, now} from "@welshman/lib"
import {EPOCH, trimFilters, guessFilterDelta, TrustedEvent, Filter} from "@welshman/util"
import {Feed, FeedType, RequestItem} from "./core.js"
import {FeedCompiler, FeedCompilerOptions} from "./compiler.js"
import {requestPage} from "./request.js"

export type FeedControllerOptions = FeedCompilerOptions & {
  feed: Feed
  onEvent?: (event: TrustedEvent) => void
  onExhausted?: () => void
  useWindowing?: boolean
}

export class FeedController {
  compiler: FeedCompiler

  constructor(readonly options: FeedControllerOptions) {
    this.compiler = new FeedCompiler(options)
  }

  getRequestItems = memoize(async () => {
    return this.compiler.canCompile(this.options.feed)
      ? this.compiler.compile(this.options.feed)
      : undefined
  })

  getLoader = memoize(async () => {
    const [type, ...feed] = this.options.feed
    const requestItems = await this.getRequestItems()

    if (requestItems) {
      return this._getRequestsLoader(requestItems)
    }

    switch (type) {
      case FeedType.Difference:
        return this._getDifferenceLoader(feed as Feed[])
      case FeedType.Intersection:
        return this._getIntersectionLoader(feed as Feed[])
      case FeedType.Union:
        return this._getUnionLoader(feed as Feed[])
      default:
        throw new Error(`Unable to convert feed of type ${type} to loader`)
    }
  })

  load = async (limit: number) => (await this.getLoader())(limit)

  async _getRequestsLoader(requests: RequestItem[]) {
    const seen = new Set()
    const exhausted = new Set()
    const loaders = await Promise.all(
      requests.map(request =>
        this._getRequestLoader(request, {
          onExhausted: () => exhausted.add(request),
          onEvent: e => {
            if (!seen.has(e.id)) {
              this.options.onEvent?.(e)
              seen.add(e.id)
            }
          },
        }),
      ),
    )

    return async (limit: number) => {
      await Promise.all(loaders.map(loader => loader(limit)))

      if (exhausted.size === requests.length) {
        this.options?.onExhausted?.()
      }
    }
  }

  async _getRequestLoader(
    {relays, filters}: RequestItem,
    {onEvent, onExhausted}: Pick<FeedControllerOptions, "onEvent" | "onExhausted">,
  ) {
    // Make sure we have some kind of filter to send if we've been given an empty one, as happens with relay feeds
    if (!filters || filters.length === 0) {
      filters = [{}]
    }

    const untils = filters.flatMap((filter: Filter) => (filter.until ? [filter.until] : []))
    const sinces = filters.flatMap((filter: Filter) => (filter.since ? [filter.since] : []))
    const maxUntil = untils.length === filters.length ? max(untils) : now()
    const minSince = sinces.length === filters.length ? min(sinces) : EPOCH
    const initialDelta = guessFilterDelta(filters)

    let promise: Deferred<void> | undefined
    let delta = initialDelta
    let since = this.options.useWindowing ? maxUntil - delta : minSince
    let until = maxUntil

    return async (limit: number) => {
      if (promise) {
        return promise
      }

      promise = defer()

      const requestFilters = filters!
        // Remove filters that don't fit our window
        .filter((filter: Filter) => {
          const filterSince = filter.since || minSince
          const filterUntil = filter.until || maxUntil

          return filterSince < until && filterUntil > since
        })
        // Modify the filters to define our window
        .map((filter: Filter) => ({...filter, until, limit, since}))

      if (requestFilters.length === 0) {
        return onExhausted?.()
      }

      let count = 0

      await requestPage(
        omitVals([undefined], {
          relays,
          filters: trimFilters(requestFilters),
          signal: this.options.signal,
          tracker: this.options.tracker,
          repository: this.options.repository,
          onEvent: (event: TrustedEvent) => {
            count += 1
            until = Math.min(until, event.created_at - 1)
            onEvent?.(event)
          },
        }),
      )

      if (this.options.useWindowing) {
        if (since === minSince) {
          onExhausted?.()
        }

        // Relays can't be relied upon to return events in descending order, do exponential
        // windowing to ensure we get the most recent stuff on first load, but eventually find it all
        if (count < limit) {
          delta = delta * Math.round(100 * (2 - inc(count) / inc(limit)))
          until = since
        }

        since = Math.max(minSince, until - delta)
      } else if (count === 0) {
        onExhausted?.()
      }

      promise.resolve()
      promise = undefined
    }
  }

  _getDifferenceLoader(feeds: Feed[]) {
    const exhausted = new Set<number>()
    const skip = new Set<string>()
    const events: TrustedEvent[] = []
    const seen = new Set()

    const controllers = feeds.map(
      (thisFeed: Feed, i: number) =>
        new FeedController({
          ...this.options,
          feed: thisFeed,
          onExhausted: () => exhausted.add(i),
          onEvent: (event: TrustedEvent) => {
            if (i === 0) {
              events.push(event)
            } else {
              skip.add(event.id)
            }
          },
        }),
    )

    return async (limit: number) => {
      await Promise.all(
        controllers.map(async (controller: FeedController, i: number) => {
          if (exhausted.has(i)) {
            return
          }

          await controller.load(limit)
        }),
      )

      for (const event of events.splice(0)) {
        if (!skip.has(event.id) && !seen.has(event.id)) {
          this.options.onEvent?.(event)
          seen.add(event.id)
        }
      }

      if (exhausted.size === controllers.length) {
        this.options.onExhausted?.()
      }
    }
  }

  _getIntersectionLoader(feeds: Feed[]) {
    const exhausted = new Set<number>()
    const counts = new Map<string, number>()
    const events: TrustedEvent[] = []
    const seen = new Set()

    const controllers = feeds.map(
      (thisFeed: Feed, i: number) =>
        new FeedController({
          ...this.options,
          feed: thisFeed,
          onExhausted: () => exhausted.add(i),
          onEvent: (event: TrustedEvent) => {
            events.push(event)
            counts.set(event.id, inc(counts.get(event.id)))
          },
        }),
    )

    return async (limit: number) => {
      await Promise.all(
        controllers.map(async (controller: FeedController, i: number) => {
          if (exhausted.has(i)) {
            return
          }

          await controller.load(limit)
        }),
      )

      for (const event of events.splice(0)) {
        if (counts.get(event.id) === controllers.length && !seen.has(event.id)) {
          this.options.onEvent?.(event)
          seen.add(event.id)
        }
      }

      if (exhausted.size === controllers.length) {
        this.options.onExhausted?.()
      }
    }
  }

  _getUnionLoader(feeds: Feed[]) {
    const exhausted = new Set<number>()
    const seen = new Set()

    const controllers = feeds.map(
      (thisFeed: Feed, i: number) =>
        new FeedController({
          ...this.options,
          feed: thisFeed,
          onExhausted: () => exhausted.add(i),
          onEvent: (event: TrustedEvent) => {
            if (!seen.has(event.id)) {
              this.options.onEvent?.(event)
              seen.add(event.id)
            }
          },
        }),
    )

    return async (limit: number) => {
      await Promise.all(
        controllers.map(async (controller: FeedController, i: number) => {
          if (exhausted.has(i)) {
            return
          }

          await controller.load(limit)
        }),
      )

      if (exhausted.size === controllers.length) {
        this.options.onExhausted?.()
      }
    }
  }
}
