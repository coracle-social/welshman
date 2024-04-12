import {inc, max, min, now, isNil} from '@coracle.social/lib'
import type {Rumor, Filter} from '@coracle.social/util'
import {Tags, EPOCH, getIdFilters, guessFilterDelta, mergeFilters} from '@coracle.social/util'
import type {DVMRequest, Scope, Feed, DynamicFilter} from './core'
import {FeedType} from './core'
import type {FeedCompiler} from './compiler'

export type LoaderOpts<E> = {
  onEvent: (event: E) => void
  onExhausted: () => void
}

export type Loader = (limit: number) => Promise<void>

export class FeedLoader<E extends Rumor> {
  _loader: Promise<Loader>

  constructor(readonly compiler: FeedCompiler<E>, feed: Feed, opts: LoaderOpts<E>) {
    this._loader = this.getLoader(feed, opts)
  }

  loadMore(limit: number) {
    this._loader.then(loader => loader(limit))
  }

  async getLoader([type, ...feed]: Feed, opts: LoaderOpts<E>) {
    if (this.compiler.canCompile([type, ...feed] as Feed)) {
      const filters = await this.compiler.compile([type, ...feed] as Feed)

      return this._getFilterLoader(filters, opts)
    }

    switch(type) {
      case FeedType.Difference:
        return this._getDifferenceLoader(feed as Feed[], opts)
      case FeedType.Intersection:
        return this._getIntersectionLoader(feed as Feed[], opts)
      case FeedType.SymmetricDifference:
        return this._getSymmetricDifferenceLoader(feed as Feed[], opts)
      case FeedType.Union:
        return this._getUnionLoader(feed as Feed[], opts)
      default:
        throw new Error(`Unable to convert feed of type ${type} to loader`)
    }
  }

  async _getFilterLoader(filters: Filter[], {onEvent, onExhausted}: LoaderOpts<E>) {
    const untils = filters.flatMap((filter: Filter) => filter.until ? [filter.until] : [])
    const sinces = filters.flatMap((filter: Filter) => filter.since ? [filter.since] : [])
    const maxUntil = untils.length === filters.length ? max(untils) : now()
    const minSince = sinces.length === filters.length ? min(sinces) : EPOCH
    const initialDelta = guessFilterDelta(filters)

    let delta = initialDelta
    let since = maxUntil - delta
    let until = maxUntil

    return async (limit: number) => {
      const reqFilters = filters
        // Remove filters that don't fit our window
        .filter((filter: Filter) => {
          const filterSince = filter.since || EPOCH
          const filterUntil = filter.until || now()

          return filterSince < until && filterUntil > since
        })
        // Modify the filters to define our window
        .map((filter: Filter) => ({...filter, until, limit, since}))

      let count = 0

      await this.compiler.opts.reqFilters(filters, {
        onEvent: (event: E) => {
          count += 1
          since = Math.min(since, event.created_at)
          onEvent(event)
        },
      })

      // Relays can't be relied upon to return events in descending order, do exponential
      // windowing to ensure we get the most recent stuff on first load, but eventually find it all
      if (count === 0) {
        delta *= 10
      }

      since = Math.max(minSince, since - delta)

      if (since === minSince) {
        onExhausted()
      }
    }
  }

  async _getDifferenceLoader(feeds: Feed[], {onEvent, onExhausted}: LoaderOpts<E>) {
    const exhausted = new Set<number>()
    const skip = new Set<string>()
    const events: E[] = []
    const seen = new Set()

    const loaders = await Promise.all(
      feeds.map((feed: Feed, i: number) =>
        this.getLoader(feed, {
          onExhausted: () => exhausted.add(i),
          onEvent: (event: E) => {
            if (i === 0) {
              events.push(event)
            } else {
              skip.add(event.id)
            }
          },
        })
      )
    )

    return async (limit: number) => {
      await Promise.all(
        loaders.map(async (loader: Loader, i: number) => {
          if (exhausted.has(i)) {
            return
          }

          await loader(limit)
        })
      )

      for (const event of events.splice(0)) {
        if (!skip.has(event.id) && !seen.has(event.id)) {
          onEvent(event)
          seen.add(event.id)
        }
      }

      if (exhausted.size === loaders.length) {
        onExhausted()
      }
    }
  }

  async _getIntersectionLoader(feeds: Feed[], {onEvent, onExhausted}: LoaderOpts<E>) {
    const exhausted = new Set<number>()
    const counts = new Map<string, number>()
    const events: E[] = []
    const seen = new Set()

    const loaders = await Promise.all(
      feeds.map((feed: Feed, i: number) =>
        this.getLoader(feed, {
          onExhausted: () => exhausted.add(i),
          onEvent: (event: E) => {
            events.push(event)
            counts.set(event.id, inc(counts.get(event.id)))
          },
        })
      )
    )

    return async (limit: number) => {
      await Promise.all(
        loaders.map(async (loader: Loader, i: number) => {
          if (exhausted.has(i)) {
            return
          }

          await loader(limit)
        })
      )

      for (const event of events.splice(0)) {
        if (counts.get(event.id) === loaders.length && !seen.has(event.id)) {
          onEvent(event)
          seen.add(event.id)
        }
      }

      if (exhausted.size === loaders.length) {
        onExhausted()
      }
    }
  }

  async _getSymmetricDifferenceLoader(feeds: Feed[], {onEvent, onExhausted}: LoaderOpts<E>) {
    const exhausted = new Set<number>()
    const counts = new Map<string, number>()
    const events: E[] = []
    const seen = new Set()

    const loaders = await Promise.all(
      feeds.map((feed: Feed, i: number) =>
        this.getLoader(feed, {
          onExhausted: () => exhausted.add(i),
          onEvent: (event: E) => {
            events.push(event)
            counts.set(event.id, inc(counts.get(event.id)))
          },
        })
      )
    )

    return async (limit: number) => {
      await Promise.all(
        loaders.map(async (loader: Loader, i: number) => {
          if (exhausted.has(i)) {
            return
          }

          await loader(limit)
        })
      )

      for (const event of events.values()) {
        if (counts.get(event.id) === 1 && !seen.has(event.id)) {
          onEvent(event)
          seen.add(event.id)
        }
      }

      if (exhausted.size === loaders.length) {
        onExhausted()
      }
    }
  }

  async _getUnionLoader(feeds: Feed[], {onEvent, onExhausted}: LoaderOpts<E>) {
    const exhausted = new Set<number>()
    const seen = new Set()

    const loaders = await Promise.all(
      feeds.map((feed: Feed, i: number) =>
        this.getLoader(feed, {
          onExhausted: () => exhausted.add(i),
          onEvent: (event: E) => {
            if (!seen.has(event.id)) {
              onEvent(event)
              seen.add(event.id)
            }
          },
        })
      )
    )

    return async (limit: number) => {
      await Promise.all(
        loaders.map(async (loader: Loader, i: number) => {
          if (exhausted.has(i)) {
            return
          }

          await loader(limit)
        })
      )

      if (exhausted.size === loaders.length) {
        onExhausted()
      }
    }
  }
}
