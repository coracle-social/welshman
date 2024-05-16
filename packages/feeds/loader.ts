import {inc, max, min, now} from '@welshman/lib'
import type {TrustedEvent, Filter} from '@welshman/util'
import {EPOCH, guessFilterDelta} from '@welshman/util'
import type {Feed, RequestItem, FeedOptions} from './core'
import {FeedType} from './core'
import {FeedCompiler} from './compiler'

export type LoadOpts<E> = {
  onEvent?: (event: E) => void
  onExhausted?: () => void
}

export type Loader = (limit: number) => Promise<void>

export class FeedLoader<E extends TrustedEvent> {
  compiler: FeedCompiler<E>

  constructor(readonly options: FeedOptions<E>) {
    this.compiler = new FeedCompiler(options)
  }

  async getLoader([type, ...feed]: Feed, loadOpts: LoadOpts<E>) {
    if (this.compiler.canCompile([type, ...feed] as Feed)) {
      return this._getRequestsLoader(await this.compiler.compile([type, ...feed] as Feed), loadOpts)
    }

    switch(type) {
      case FeedType.Difference:
        return this._getDifferenceLoader(feed as Feed[], loadOpts)
      case FeedType.Intersection:
        return this._getIntersectionLoader(feed as Feed[], loadOpts)
      case FeedType.SymmetricDifference:
        return this._getSymmetricDifferenceLoader(feed as Feed[], loadOpts)
      case FeedType.Union:
        return this._getUnionLoader(feed as Feed[], loadOpts)
      default:
        throw new Error(`Unable to convert feed of type ${type} to loader`)
    }
  }

  async _getRequestsLoader(requests: RequestItem[], {onEvent, onExhausted}: LoadOpts<E>) {
    const seen = new Set()
    const exhausted = new Set()
    const loaders = await Promise.all(
      requests.map(
        request => this._getRequestLoader(request, {
          onExhausted: () => exhausted.add(request),
          onEvent: e => {
            if (!seen.has(e.id)) {
              onEvent?.(e)
              seen.add(e.id)
            }
          },
        })
      )
    )

    return async (limit: number) => {
      await Promise.all(loaders.map(loader => loader(limit)))

      if (exhausted.size === requests.length) {
        onExhausted?.()
      }
    }
  }

  async _getRequestLoader({relays, filters}: RequestItem, {onEvent, onExhausted}: LoadOpts<E>) {
    // Make sure we have some kind of filter to send if we've been given an empty one, as happens with relay feeds
    if (!filters || filters.length === 0) {
      filters = [{}]
    }

    const untils = filters.flatMap((filter: Filter) => filter.until ? [filter.until] : [])
    const sinces = filters.flatMap((filter: Filter) => filter.since ? [filter.since] : [])
    const maxUntil = untils.length === filters.length ? max(untils) : now()
    const minSince = sinces.length === filters.length ? min(sinces) : EPOCH
    const initialDelta = guessFilterDelta(filters)

    let delta = initialDelta
    let since = maxUntil - delta
    let until = maxUntil

    return async (limit: number) => {
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

      await this.options.request({
        relays,
        filters: requestFilters,
        onEvent: (event: E) => {
          count += 1
          until = Math.min(until, event.created_at)
          onEvent?.(event)
        },
      })

      // Relays can't be relied upon to return events in descending order, do exponential
      // windowing to ensure we get the most recent stuff on first load, but eventually find it all
      if (count === 0) {
        delta *= 10
        until = since
      }

      since = Math.max(minSince, until - delta)

      if (since === minSince) {
        onExhausted?.()
      }
    }
  }

  async _getDifferenceLoader(feeds: Feed[], {onEvent, onExhausted}: LoadOpts<E>) {
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
          onEvent?.(event)
          seen.add(event.id)
        }
      }

      if (exhausted.size === loaders.length) {
        onExhausted?.()
      }
    }
  }

  async _getIntersectionLoader(feeds: Feed[], {onEvent, onExhausted}: LoadOpts<E>) {
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
          onEvent?.(event)
          seen.add(event.id)
        }
      }

      if (exhausted.size === loaders.length) {
        onExhausted?.()
      }
    }
  }

  async _getSymmetricDifferenceLoader(feeds: Feed[], {onEvent, onExhausted}: LoadOpts<E>) {
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
          onEvent?.(event)
          seen.add(event.id)
        }
      }

      if (exhausted.size === loaders.length) {
        onExhausted?.()
      }
    }
  }

  async _getUnionLoader(feeds: Feed[], {onEvent, onExhausted}: LoadOpts<E>) {
    const exhausted = new Set<number>()
    const seen = new Set()

    const loaders = await Promise.all(
      feeds.map((feed: Feed, i: number) =>
        this.getLoader(feed, {
          onExhausted: () => exhausted.add(i),
          onEvent: (event: E) => {
            if (!seen.has(event.id)) {
              onEvent?.(event)
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
        onExhausted?.()
      }
    }
  }
}
