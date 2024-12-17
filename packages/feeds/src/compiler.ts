import {uniq, identity, flatten, pushToMapKey, intersection, tryCatch, now} from "@welshman/lib"
import type {TrustedEvent, Filter} from "@welshman/util"
import {intersectFilters, matchFilter, getAddress, getIdFilters, unionFilters} from "@welshman/util"
import type {
  CreatedAtItem,
  RequestItem,
  ListItem,
  LabelItem,
  WOTItem,
  DVMItem,
  Scope,
  Feed,
  FeedOptions,
} from "./core.js"
import {getFeedArgs, feedsFromTags} from "./utils.js"
import {FeedType} from "./core.js"

export class FeedCompiler {
  constructor(readonly options: FeedOptions) {}

  canCompile(feed: Feed): boolean {
    switch (feed[0]) {
      case FeedType.Union:
      case FeedType.Intersection:
        return getFeedArgs(feed).every(f => this.canCompile(f))
      case FeedType.Address:
      case FeedType.Author:
      case FeedType.CreatedAt:
      case FeedType.DVM:
      case FeedType.ID:
      case FeedType.Global:
      case FeedType.Kind:
      case FeedType.List:
      case FeedType.Label:
      case FeedType.Relay:
      case FeedType.Scope:
      case FeedType.Search:
      case FeedType.Tag:
      case FeedType.WOT:
        return true
      default:
        return false
    }
  }

  async compile(feed: Feed): Promise<RequestItem[]> {
    switch (feed[0]) {
      case FeedType.ID:
        return this._compileFilter("ids", getFeedArgs(feed))
      case FeedType.Kind:
        return this._compileFilter("kinds", getFeedArgs(feed))
      case FeedType.Author:
        return this._compileFilter("authors", getFeedArgs(feed))
      case FeedType.DVM:
        return await this._compileDvms(getFeedArgs(feed))
      case FeedType.Intersection:
        return await this._compileIntersection(getFeedArgs(feed))
      case FeedType.List:
        return await this._compileLists(getFeedArgs(feed))
      case FeedType.Label:
        return await this._compileLabels(getFeedArgs(feed))
      case FeedType.Union:
        return await this._compileUnion(getFeedArgs(feed))
      case FeedType.Address:
        return this._compileAddresses(getFeedArgs(feed))
      case FeedType.CreatedAt:
        return this._compileCreatedAt(getFeedArgs(feed))
      case FeedType.Scope:
        return this._compileScopes(getFeedArgs(feed))
      case FeedType.Search:
        return this._compileSearches(getFeedArgs(feed))
      case FeedType.WOT:
        return this._compileWot(getFeedArgs(feed))
      case FeedType.Relay:
        return [{relays: getFeedArgs(feed)}]
      case FeedType.Global:
        return [{filters: [{}]}]
      case FeedType.Tag: {
        const [key, ...value] = getFeedArgs(feed)

        return this._compileFilter(key, value)
      }
      default:
        throw new Error(`Unable to convert feed of type ${feed[0]} to filters`)
    }
  }

  _compileAddresses(addresses: string[]) {
    return [{filters: getIdFilters(addresses)}]
  }

  _compileFilter(key: string, value: any) {
    return [{filters: [{[key]: value} as Filter]}]
  }

  _compileCreatedAt(items: CreatedAtItem[]) {
    const filters = items
      .map(({since, until, relative = []}) => {
        if (since && relative.includes("since")) {
          since = now() - since
        }

        if (until && relative.includes("until")) {
          until = now() - until
        }

        if (since && until) return {since, until}
        if (since) return {since}
        if (until) return {until}

        return null
      })
      .filter(identity)

    return [{filters: filters as Filter[]}]
  }

  _compileScopes(scopes: Scope[]) {
    return [{filters: [{authors: uniq(scopes.flatMap(this.options.getPubkeysForScope))}]}]
  }

  _compileSearches(searches: string[]) {
    return [{filters: searches.map(search => ({search}))}]
  }

  _compileWot(wotItems: WOTItem[]) {
    return [
      {
        filters: wotItems.map(({min = 0, max = 1}) => ({
          authors: this.options.getPubkeysForWOTRange(min, max),
        })),
      },
    ]
  }

  async _compileDvms(items: DVMItem[]): Promise<RequestItem[]> {
    const feeds: Feed[] = []

    await Promise.all(
      items.map(({mappings, ...request}) =>
        this.options.requestDVM({
          ...request,
          onEvent: async (e: TrustedEvent) => {
            const tags = (await tryCatch(() => JSON.parse(e.content))) || []

            for (const feed of feedsFromTags(tags, mappings)) {
              feeds.push(feed)
            }
          },
        }),
      ),
    )

    return await this._compileUnion(feeds)
  }

  async _compileIntersection(feeds: Feed[]): Promise<RequestItem[]> {
    const [head, ...tail] = await Promise.all(feeds.map(f => this.compile(f)))

    const result = []

    for (let {filters, relays} of head || []) {
      const matchingGroups = tail
        .map(items =>
          items.filter(
            it =>
              (!relays || !it.relays || intersection(relays, it.relays).length > 0) &&
              (!filters || !it.filters || intersectFilters([filters, it.filters]).length > 0),
          ),
        )
        .filter(items => items.length > 0)

      if (matchingGroups.length < tail.length) {
        continue
      }

      for (const items of matchingGroups) {
        for (const item of items) {
          if (relays && item.relays) {
            relays = relays.filter(r => item.relays!.includes(r))
          } else if (item.relays) {
            relays = item.relays
          }

          if (filters && item.filters) {
            filters = intersectFilters([filters, item.filters])
          } else if (item.filters) {
            filters = item.filters
          }
        }
      }

      result.push({relays, filters})
    }

    return result
  }

  async _compileUnion(feeds: Feed[]): Promise<RequestItem[]> {
    const filtersByRelay = new Map<string, Filter[]>()
    const filtersWithoutRelay: Filter[] = []
    const relaysWithoutFilter: string[] = []

    await Promise.all(
      feeds.map(async feed => {
        for (const item of await this.compile(feed)) {
          if (item.relays) {
            for (const relay of item.relays) {
              if (item.filters) {
                for (const filter of item.filters) {
                  pushToMapKey(filtersByRelay, relay, filter)
                }
              } else {
                relaysWithoutFilter.push(relay)
              }
            }
          } else if (item.filters) {
            for (const filter of item.filters) {
              filtersWithoutRelay.push(filter)
            }
          }
        }
      }),
    )

    const items: RequestItem[] = []

    for (const [relay, filters] of filtersByRelay.entries()) {
      items.push({
        relays: [relay],
        filters: unionFilters(filters),
      })
    }

    if (filtersWithoutRelay.length > 0) {
      items.push({filters: unionFilters(filtersWithoutRelay)})
    }

    if (relaysWithoutFilter.length > 0) {
      items.push({relays: uniq(relaysWithoutFilter)})
    }

    return items
  }

  async _compileLists(listItems: ListItem[]): Promise<RequestItem[]> {
    const addresses = uniq(listItems.flatMap(({addresses}) => addresses))
    const eventsByAddress = new Map<string, TrustedEvent>()

    await this.options.request({
      filters: getIdFilters(addresses),
      onEvent: (e: TrustedEvent) => eventsByAddress.set(getAddress(e), e),
    })

    const feeds = flatten(
      await Promise.all(
        listItems.map(({addresses, mappings}) => {
          const feeds: Feed[] = []

          for (const address of addresses) {
            const event = eventsByAddress.get(address)

            if (event) {
              for (const feed of feedsFromTags(event.tags, mappings)) {
                feeds.push(feed)
              }
            }
          }

          return feeds
        }),
      ),
    )

    return this._compileUnion(feeds)
  }

  async _compileLabels(labelItems: LabelItem[]): Promise<RequestItem[]> {
    const events: TrustedEvent[] = []

    await Promise.all(
      labelItems.map(({mappings, relays, ...filter}) =>
        this.options.request({
          relays,
          filters: [{kinds: [1985], ...filter}],
          onEvent: (e: TrustedEvent) => events.push(e),
        }),
      ),
    )

    const feeds = flatten(
      await Promise.all(
        labelItems.map(({mappings, relays, ...filter}) => {
          const tags: string[][] = []

          for (const event of events) {
            if (matchFilter(filter, event)) {
              for (const tag of event.tags) {
                tags.push(tag)
              }
            }
          }

          return feedsFromTags(tags, mappings)
        }),
      ),
    )

    return this._compileUnion(feeds)
  }
}
