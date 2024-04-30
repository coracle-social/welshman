import {uniq, flatten, pushToMapKey, intersection, ensureNumber, tryCatch, now} from '@welshman/lib'
import type {Rumor, Filter} from '@welshman/util'
import {Tags, intersectFilters, getAddress, getIdFilters, unionFilters} from '@welshman/util'
import type {WOTItem, RequestItem, TagFilterMapping, ListItem, DVMItem, Scope, Feed, FeedOptions} from './core'
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
      case FeedType.Union:
      case FeedType.Intersection:
        return getSubFeeds([type, ...feed] as Feed).every(f => this.canCompile(f))
      case FeedType.Address:
      case FeedType.Author:
      case FeedType.DVM:
      case FeedType.ID:
      case FeedType.Kind:
      case FeedType.List:
      case FeedType.Relay:
      case FeedType.Scope:
      case FeedType.Since:
      case FeedType.SinceAgo:
      case FeedType.Tag:
      case FeedType.Until:
      case FeedType.UntilAgo:
      case FeedType.WOT:
        return true
      default:
        return false
    }
  }

  async compile([type, ...feed]: Feed): Promise<RequestItem[]> {
    switch(type) {
      case FeedType.Address:      return this._compileAddresses(feed as string[])
      case FeedType.Author:       return this._compileFilter("authors", feed as string[])
      case FeedType.DVM:          return await this._compileDvms(feed as DVMItem[])
      case FeedType.ID:           return this._compileFilter("ids", feed as string[])
      case FeedType.Intersection: return await this._compileIntersection(feed as Feed[])
      case FeedType.Kind:         return this._compileFilter("kinds", feed as number[])
      case FeedType.List:         return await this._compileLists(feed as ListItem[])
      case FeedType.Relay:        return [{relays: feed as string[]}]
      case FeedType.Scope:        return this._compileScopes(feed as Scope[])
      case FeedType.Since:        return this._compileFilter("since", feed[0] as number)
      case FeedType.SinceAgo:     return this._compileFilter("since", now() - (feed[0] as number))
      case FeedType.Tag:          return this._compileFilter(feed[0] as string, feed.slice(1) as string[])
      case FeedType.Until:        return this._compileFilter("until", feed[0] as number)
      case FeedType.UntilAgo:     return this._compileFilter("until", now() - (feed[0] as number))
      case FeedType.Union:        return await this._compileUnion(feed as Feed[])
      case FeedType.WOT:          return this._compileWot(feed as WOTItem)
      default:
        throw new Error(`Unable to convert feed of type ${type} to filters`)
    }
  }

  _compileAddresses(addresses: string[]) {
    return [{filters: getIdFilters(addresses)}]
  }

  _compileFilter(key: string, value: any) {
    return [{filters: [{[key]: value} as Filter]}]
  }

  _compileScopes(scopes: Scope[]) {
    return [{filters: [{authors: uniq(scopes.flatMap(this.options.getPubkeysForScope))}]}]
  }

  _compileWot({min = 0, max = 1}) {
    return [{filters: [{authors: this.options.getPubkeysForWotRange(min, max)}]}]
  }

  async _compileDvms(items: DVMItem[]): Promise<RequestItem[]> {
    const filters: Filter[] = []

    await Promise.all(
      items.map(({mappings, ...request}) =>
        this.options.requestDvm({
          ...request,
          onEvent: async (e: E) => {
            const tags = Tags.fromEvent(e)
            const request = await tryCatch(() => JSON.parse(tags.get("request")?.value()))
            const responseTags = tags.rejectByValue([request?.id, request?.pubkey])

            for (const filter of await this._getFiltersFromTags(responseTags, mappings)) {
              filters.push(filter)
            }
          },
        })
      )
    )

    return [{filters: unionFilters(filters)}]
  }

  async _compileIntersection(feeds: Feed[]): Promise<RequestItem[]> {
    const [head, ...tail] = await Promise.all(feeds.map(f => this.compile(f)))

    const result = []

    for (let {filters, relays} of head) {
      const matchingGroups = tail.map(
        items => items.filter(
          it => (
            (!relays || !it.relays || intersection(relays, it.relays).length > 0) &&
            (!filters || !it.filters || intersectFilters([filters, it.filters]).length > 0)
          )
        )
      ).filter(
        items => items.length > 0
      )

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
      })
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
    const addresses = uniq(listItems.map(({address}) => address))
    const eventsByAddress = new Map<string, E>()

    await this.options.request({
      filters: getIdFilters(addresses),
      onEvent: (e: E) => eventsByAddress.set(getAddress(e), e),
    })

    const filters = flatten(
      await Promise.all(
        listItems.map(({address, mappings}) => {
          const event = eventsByAddress.get(address)

          return event ? this._getFiltersFromTags(Tags.fromEvent(event), mappings) : []
        })
      )
    )

    return [{filters: unionFilters(filters)}]
  }

  // Utilities

  async _getFiltersFromTags(tags: Tags, mappings: TagFilterMapping[]) {
    const filters = []

    for (const [tagName, feedType] of mappings) {
      const filterTags = tags.whereKey(tagName)

      if (filterTags.exists()) {
        let values: string[] | number[] = filterTags.values().valueOf()

        if (feedType === FeedType.Kind) {
          values = values.map(ensureNumber) as number[]
        }

        for (const item of await this.compile([feedType, ...values] as Feed)) {
          for (const filter of item.filters || []) {
            filters.push(filter)
          }
        }
      }
    }

    return unionFilters(filters)
  }
}
