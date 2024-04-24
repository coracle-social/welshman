import {uniq, now, isNil} from '@welshman/lib'
import type {Rumor, Filter} from '@welshman/util'
import {Tags, getIdFilters, mergeFilters} from '@welshman/util'
import type {RequestItem, DVMItem, Scope, Feed, DynamicFilter, FeedOptions} from './core'
import {FeedType, getSubFeeds} from './core'

export class FeedCompiler<E extends Rumor> {
  constructor(readonly options: FeedOptions<E>) {}

  walk(feed: Feed, visit: (feed: Feed) => void) {
    visit(feed)

    for (const subFeed of getSubFeeds(feed)) {
      this.walk(subFeed, visit)
    }
  }

  canCompile([type, ...feed]: Feed): boolean {
    switch(type) {
      case FeedType.Relay:
      case FeedType.Union:
        return getSubFeeds([type, ...feed] as Feed).every(this.canCompile)
      case FeedType.Filter:
      case FeedType.List:
      case FeedType.DVM:
        return true
      default:
        return false
    }
  }

  async compile([type, ...feed]: Feed) {
    switch(type) {
      case FeedType.Union:
        return await this._compileUnion(feed as Feed[])
      case FeedType.Relay:
        /* eslint no-case-declarations: 0 */
        const {relays, filters} = await this._compileUnion(feed.slice(1) as Feed[])

        return {relays: relays.concat(feed[0] as string[]), filters}
      case FeedType.Filter:
        return {
          relays: [],
          filters: (feed as DynamicFilter[]).map(filter => this._compileFilter(filter)),
        }
      case FeedType.List:
        return await this._compileLists(feed as string[])
      case FeedType.DVM:
        return await this._compileDvms(feed as DVMItem[])
      default:
        throw new Error(`Unable to convert feed of type ${type} to filters`)
    }
  }

  async _compileUnion(feeds: Feed[]): Promise<RequestItem> {
    const relays: string[] = []
    const filters: Filter[] = []

    await Promise.all(
      feeds.map(async feed => {
        const item = await this.compile(feed)

        for (const relay of item.relays) {
          relays.push(relay)
        }

        for (const filter of item.filters) {
          filters.push(filter)
        }
      })
    )

    return {
      relays: uniq(relays),
      filters: mergeFilters(filters),
    }
  }

  async _compileLists(addresses: string[]): Promise<RequestItem> {
    const events: E[] = []

    await this.options.request({
      relays: [],
      filters: getIdFilters(addresses),
      onEvent: events.push,
    })

    return {
      relays: [],
      filters: this._getFiltersFromTags(Tags.fromEvents(events)),
    }
  }

  async _compileDvms(requests: DVMItem[]): Promise<RequestItem> {
    const events: E[] = []

    await Promise.all(
      requests.map(request =>
        this.options.requestDvm({
          tags: [],
          ...request,
          onEvent: events.push,
        })
      )
    )

    return {
      relays: [],
      filters: this._getFiltersFromTags(Tags.fromEvents(events)),
    }
  }

  // Utilities

  _compileFilter({scopes, min_wot, max_wot, until_ago, since_ago, ...filter}: DynamicFilter) {
    if (scopes && !filter.authors) {
      filter.authors = scopes.flatMap((scope: Scope) => this.options.getPubkeysForScope(scope))
    }

    if ((!isNil(min_wot) || !isNil(max_wot))) {
      const authors = this.options.getPubkeysForWotRange(min_wot || 0, max_wot || 1)

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
