import {ensureNumber} from "@welshman/lib"
import type {Filter} from "@welshman/util"
import {getTagValues} from "@welshman/util"
import {
  FeedType,
  Feed,
  AddressFeed,
  AuthorFeed,
  CreatedAtFeed,
  DVMFeed,
  DifferenceFeed,
  IDFeed,
  IntersectionFeed,
  GlobalFeed,
  KindFeed,
  ListFeed,
  LabelFeed,
  WOTFeed,
  RelayFeed,
  ScopeFeed,
  SearchFeed,
  TagFeed,
  UnionFeed,
  TagFeedMapping,
  Scope,
  WOTItem,
  DVMItem,
  ListItem,
  LabelItem,
  CreatedAtItem,
} from "./core.js"

export const makeAddressFeed = (...addresses: string[]): AddressFeed => [
  FeedType.Address,
  ...addresses,
]
export const makeAuthorFeed = (...pubkeys: string[]): AuthorFeed => [FeedType.Author, ...pubkeys]
export const makeCreatedAtFeed = (...items: CreatedAtItem[]): CreatedAtFeed => [
  FeedType.CreatedAt,
  ...items,
]
export const makeDVMFeed = (...items: DVMItem[]): DVMFeed => [FeedType.DVM, ...items]
export const makeDifferenceFeed = (...feeds: Feed[]): DifferenceFeed => [
  FeedType.Difference,
  ...feeds,
]
export const makeIDFeed = (...ids: string[]): IDFeed => [FeedType.ID, ...ids]
export const makeIntersectionFeed = (...feeds: Feed[]): IntersectionFeed => [
  FeedType.Intersection,
  ...feeds,
]
export const makeGlobalFeed = (): GlobalFeed => [FeedType.Global]
export const makeKindFeed = (...kinds: number[]): KindFeed => [FeedType.Kind, ...kinds]
export const makeListFeed = (...items: ListItem[]): ListFeed => [FeedType.List, ...items]
export const makeLabelFeed = (...items: LabelItem[]): LabelFeed => [FeedType.Label, ...items]
export const makeWOTFeed = (...items: WOTItem[]): WOTFeed => [FeedType.WOT, ...items]
export const makeRelayFeed = (...urls: string[]): RelayFeed => [FeedType.Relay, ...urls]
export const makeScopeFeed = (...scopes: Scope[]): ScopeFeed => [FeedType.Scope, ...scopes]
export const makeSearchFeed = (...searches: string[]): SearchFeed => [FeedType.Search, ...searches]
export const makeTagFeed = (key: string, ...values: string[]): TagFeed => [
  FeedType.Tag,
  key,
  ...values,
]
export const makeUnionFeed = (...feeds: Feed[]): UnionFeed => [FeedType.Union, ...feeds]

export const isAddressFeed = (feed: Feed): feed is AddressFeed => feed[0] === FeedType.Address
export const isAuthorFeed = (feed: Feed): feed is AuthorFeed => feed[0] === FeedType.Author
export const isCreatedAtFeed = (feed: Feed): feed is CreatedAtFeed => feed[0] === FeedType.CreatedAt
export const isDVMFeed = (feed: Feed): feed is DVMFeed => feed[0] === FeedType.DVM
export const isDifferenceFeed = (feed: Feed): feed is DifferenceFeed =>
  feed[0] === FeedType.Difference
export const isIDFeed = (feed: Feed): feed is IDFeed => feed[0] === FeedType.ID
export const isIntersectionFeed = (feed: Feed): feed is IntersectionFeed =>
  feed[0] === FeedType.Intersection
export const isGlobalFeed = (feed: Feed): feed is GlobalFeed => feed[0] === FeedType.Global
export const isKindFeed = (feed: Feed): feed is KindFeed => feed[0] === FeedType.Kind
export const isListFeed = (feed: Feed): feed is ListFeed => feed[0] === FeedType.List
export const isLabelFeed = (feed: Feed): feed is LabelFeed => feed[0] === FeedType.Label
export const isWOTFeed = (feed: Feed): feed is WOTFeed => feed[0] === FeedType.WOT
export const isRelayFeed = (feed: Feed): feed is RelayFeed => feed[0] === FeedType.Relay
export const isScopeFeed = (feed: Feed): feed is ScopeFeed => feed[0] === FeedType.Scope
export const isSearchFeed = (feed: Feed): feed is SearchFeed => feed[0] === FeedType.Search
export const isTagFeed = (feed: Feed): feed is TagFeed => feed[0] === FeedType.Tag
export const isUnionFeed = (feed: Feed): feed is UnionFeed => feed[0] === FeedType.Union

export function getFeedArgs(feed: IntersectionFeed | UnionFeed | DifferenceFeed): Feed[]
export function getFeedArgs(
  feed: AddressFeed | AuthorFeed | IDFeed | RelayFeed | SearchFeed,
): string[]
export function getFeedArgs(feed: CreatedAtFeed): CreatedAtItem[]
export function getFeedArgs(feed: ListFeed): ListItem[]
export function getFeedArgs(feed: LabelFeed): LabelItem[]
export function getFeedArgs(feed: DVMFeed): DVMItem[]
export function getFeedArgs(feed: WOTFeed): WOTItem[]
export function getFeedArgs(feed: ScopeFeed): Scope[]
export function getFeedArgs(feed: KindFeed): number[]
export function getFeedArgs(feed: TagFeed): [string, ...string[]]
export function getFeedArgs(feed: GlobalFeed): []
export function getFeedArgs(feed: Feed) {
  switch (feed[0]) {
    case FeedType.Intersection:
      return feed.slice(1) as Feed[]
    case FeedType.Union:
      return feed.slice(1) as Feed[]
    case FeedType.Difference:
      return feed.slice(1) as Feed[]
    case FeedType.Address:
      return feed.slice(1) as string[]
    case FeedType.Author:
      return feed.slice(1) as string[]
    case FeedType.ID:
      return feed.slice(1) as string[]
    case FeedType.Relay:
      return feed.slice(1) as string[]
    case FeedType.Search:
      return feed.slice(1) as string[]
    case FeedType.Tag:
      return feed.slice(1) as [string, ...string[]]
    case FeedType.CreatedAt:
      return feed.slice(1) as CreatedAtItem[]
    case FeedType.List:
      return feed.slice(1) as ListItem[]
    case FeedType.Label:
      return feed.slice(1) as LabelItem[]
    case FeedType.DVM:
      return feed.slice(1) as DVMItem[]
    case FeedType.WOT:
      return feed.slice(1) as WOTItem[]
    case FeedType.Scope:
      return feed.slice(1) as Scope[]
    case FeedType.Kind:
      return feed.slice(1) as number[]
    case FeedType.Global:
      return feed.slice(1) as never[]
    default:
      throw new Error(`Invalid feed type ${feed[0]}`)
  }
}

export const hasSubFeeds = (feed: Feed): feed is IntersectionFeed | UnionFeed | DifferenceFeed =>
  [FeedType.Union, FeedType.Intersection, FeedType.Difference].includes(feed[0])

export const defaultTagFeedMappings: TagFeedMapping[] = [
  ["a", [FeedType.Address]],
  ["e", [FeedType.ID]],
  ["p", [FeedType.Author]],
  ["r", [FeedType.Relay]],
  ["t", [FeedType.Tag, "#t"]],
]

export const feedsFromTags = (tags: string[][], mappings?: TagFeedMapping[]) => {
  const feeds = []

  for (const [tagName, templateFeed] of mappings || defaultTagFeedMappings) {
    let values: any[] = getTagValues(tagName, tags)

    if (values.length > 0) {
      if (isKindFeed(templateFeed)) {
        values = values.map(ensureNumber) as number[]
      }

      feeds.push([...templateFeed, ...values] as Feed)
    }
  }

  return feeds
}

export const feedFromTags = (tags: string[][], mappings?: TagFeedMapping[]) =>
  makeIntersectionFeed(...feedsFromTags(tags, mappings))

export const feedsFromFilter = ({since, until, ...filter}: Filter) => {
  const feeds = []

  if (since && until) {
    feeds.push(makeCreatedAtFeed({since, until}))
  } else if (since) {
    feeds.push(makeCreatedAtFeed({since}))
  } else if (until) {
    feeds.push(makeCreatedAtFeed({until}))
  }

  for (const [k, v] of Object.entries(filter)) {
    if (k === "ids") feeds.push(makeIDFeed(...(v as string[])))
    else if (k === "kinds") feeds.push(makeKindFeed(...(v as number[])))
    else if (k === "authors") feeds.push(makeAuthorFeed(...(v as string[])))
    else if (k.startsWith("#")) feeds.push(makeTagFeed(k as string, ...(v as string[])))
    else throw new Error(`Unable to create feed from filter ${k}: ${v}`)
  }

  return feeds
}

export const feedFromFilter = (filter: Filter) => makeIntersectionFeed(...feedsFromFilter(filter))

export const feedFromFilters = (filters: Filter[]) =>
  makeUnionFeed(...filters.map(filter => feedFromFilter(filter)))

export const walkFeed = (feed: Feed, visit: (feed: Feed) => void) => {
  visit(feed)

  if (hasSubFeeds(feed)) {
    for (const subFeed of getFeedArgs(feed)) {
      walkFeed(subFeed, visit)
    }
  }
}
