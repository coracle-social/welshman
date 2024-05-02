import type {Filter} from '@welshman/util'

export enum FeedType {
  Address = "address",
  Author = "author",
  CreatedAt = "created_at",
  DVM = "dvm",
  Difference = "difference",
  ID = "id",
  Intersection = "intersection",
  Kind = "kind",
  List = "list",
  WOT = "wot",
  Relay = "relay",
  Scope = "scope",
  Search = "search",
  SymmetricDifference = "symmetric_difference",
  Tag = "tag",
  Union = "union",
}

export enum Scope {
  Followers = "followers",
  Follows = "follows",
  Network = "network",
  Self = "self",
}

export type FilterFeedType =
  FeedType.ID |
  FeedType.Address |
  FeedType.Author |
  FeedType.Kind |
  FeedType.Relay |
  FeedType.Tag

export type TagFilterMapping = [string, FilterFeedType]

export type DVMItem = {
  kind: number,
  mappings: TagFilterMapping[],
  tags?: string[][],
  relays?: string[],
}

export type ListItem = {
  address: string,
  mappings: TagFilterMapping[],
}

export type WOTItem = {
  min?: number,
  max?: number,
}

export type CreatedAtItem = {
  since?: number,
  until?: number,
  relative?: boolean,
}

export type AddressFeed = [type: FeedType.Address, ...addresses: string[]]
export type AuthorFeed = [type: FeedType.Author, ...pubkeys: string[]]
export type CreatedAtFeed = [type: FeedType.CreatedAt, ...items: CreatedAtItem[]]
export type DVMFeed = [type: FeedType.DVM, ...items: DVMItem[]]
export type DifferenceFeed = [type: FeedType.Difference, ...feeds: Feed[]]
export type IDFeed = [type: FeedType.ID, ...ids: string[]]
export type IntersectionFeed = [type: FeedType.Intersection, ...feeds: Feed[]]
export type KindFeed = [type: FeedType.Kind, ...kinds: number[]]
export type ListFeed = [type: FeedType.List, ...items: ListItem[]]
export type WOTFeed = [type: FeedType.WOT, ...items: WOTItem[]]
export type RelayFeed = [type: FeedType.Relay, ...urls: string[]]
export type ScopeFeed = [type: FeedType.Scope, ...scopes: Scope[]]
export type SearchFeed = [type: FeedType.Search, ...searches: string[]]
export type SymmetricDifferenceFeed = [type: FeedType.SymmetricDifference, ...feeds: Feed[]]
export type TagFeed = [type: FeedType.Tag, key: string, ...values: string[]]
export type UnionFeed = [type: FeedType.Union, ...feeds: Feed[]]

export type Feed =
  AddressFeed |
  AuthorFeed |
  CreatedAtFeed |
  DVMFeed |
  DifferenceFeed |
  IDFeed |
  IntersectionFeed |
  KindFeed |
  ListFeed |
  WOTFeed |
  RelayFeed |
  ScopeFeed |
  SearchFeed |
  SymmetricDifferenceFeed |
  TagFeed |
  UnionFeed

export const addressFeed = (...addresses: string[]): AddressFeed => [FeedType.Address, ...addresses]
export const authorFeed = (...pubkeys: string[]): AuthorFeed => [FeedType.Author, ...pubkeys]
export const createdAtFeed = (...items: CreatedAtItem[]): CreatedAtFeed => [FeedType.CreatedAt, ...items]
export const dvmFeed = (...items: DVMItem[]): DVMFeed => [FeedType.DVM, ...items]
export const differenceFeed = (...feeds: Feed[]): DifferenceFeed => [FeedType.Difference, ...feeds]
export const idFeed = (...ids: string[]): IDFeed => [FeedType.ID, ...ids]
export const intersectionFeed = (...feeds: Feed[]): IntersectionFeed => [FeedType.Intersection, ...feeds]
export const kindFeed = (...kinds: number[]): KindFeed => [FeedType.Kind, ...kinds]
export const listFeed = (...items: ListItem[]): ListFeed => [FeedType.List, ...items]
export const wotFeed = (...items: WOTItem[]): WOTFeed => [FeedType.WOT, ...items]
export const relayFeed = (...urls: string[]): RelayFeed => [FeedType.Relay, ...urls]
export const scopeFeed = (...scopes: Scope[]): ScopeFeed => [FeedType.Scope, ...scopes]
export const searchFeed = (...searches: string[]): SearchFeed => [FeedType.Search, ...searches]
export const symmetricDifferenceFeed = (...feeds: Feed[]): SymmetricDifferenceFeed => [FeedType.SymmetricDifference, ...feeds]
export const tagFeed = (key: string, ...values: string[]): TagFeed => [FeedType.Tag, key, ...values]
export const unionFeed = (...feeds: Feed[]): UnionFeed => [FeedType.Union, ...feeds]

export const feedsFromFilter = ({since, until, ...filter}: Filter) => {
  const feeds = []

  if (since && until) {
    feeds.push(createdAtFeed({since, until}))
  } else if (since) {
    feeds.push(createdAtFeed({since}))
  } else if (until) {
    feeds.push(createdAtFeed({until}))
  }

  for (const [k, v] of Object.entries(filter)) {
    if (k === 'ids') feeds.push(idFeed(...v as string[]))
    else if (k === 'kinds') feeds.push(kindFeed(...v as number[]))
    else if (k === 'authors') feeds.push(authorFeed(...v as string[]))
    else if (k.startsWith('#')) feeds.push(tagFeed(k as string, ...v as string[]))
    else throw new Error(`Unable to create feed from filter ${k}: ${v}`)
  }

  return feeds
}

export const feedFromFilter = (filter: Filter) => intersectionFeed(...feedsFromFilter(filter))

export const isAddressFeed = (feed: Feed) => feed[0] === FeedType.Address
export const isAuthorFeed = (feed: Feed) => feed[0] === FeedType.Author
export const isCreatedAtFeed = (feed: Feed) => feed[0] === FeedType.CreatedAt
export const isDvmFeed = (feed: Feed) => feed[0] === FeedType.DVM
export const isDifferenceFeed = (feed: Feed) => feed[0] === FeedType.Difference
export const isIdFeed = (feed: Feed) => feed[0] === FeedType.ID
export const isIntersectionFeed = (feed: Feed) => feed[0] === FeedType.Intersection
export const isKindFeed = (feed: Feed) => feed[0] === FeedType.Kind
export const isListFeed = (feed: Feed) => feed[0] === FeedType.List
export const isWotFeed = (feed: Feed) => feed[0] === FeedType.WOT
export const isRelayFeed = (feed: Feed) => feed[0] === FeedType.Relay
export const isScopeFeed = (feed: Feed) => feed[0] === FeedType.Scope
export const isSearchFeed = (feed: Feed) => feed[0] === FeedType.Search
export const isSymmetricDifferenceFeed = (feed: Feed) => feed[0] === FeedType.SymmetricDifference
export const isTagFeed = (feed: Feed) => feed[0] === FeedType.Tag
export const isUnionFeed = (feed: Feed) => feed[0] === FeedType.Union

export const hasSubFeeds = ([type]: [FeedType, ...any[]]) =>
  [
    FeedType.Union,
    FeedType.Intersection,
    FeedType.Difference,
    FeedType.SymmetricDifference,
  ].includes(type)

export const getSubFeeds = ([type, ...feeds]: Feed): Feed[] => hasSubFeeds([type]) ? feeds as Feed[] : []

export type RequestItem = {
  relays?: string[]
  filters?: Filter[]
}

export type RequestOpts<E> = RequestItem & {
  onEvent: (event: E) => void
}

export type DVMRequest = {
  kind: number,
  tags?: string[][],
  relays?: string[],
}

export type DVMOpts<E> = DVMRequest & {
  onEvent: (event: E) => void
}

export type FeedOptions<E> = {
  request: (opts: RequestOpts<E>) => Promise<void>
  requestDvm: (opts: DVMOpts<E>) => Promise<void>
  getPubkeysForScope: (scope: Scope) => string[]
  getPubkeysForWotRange: (minWot: number, maxWot: number) => string[]
}
