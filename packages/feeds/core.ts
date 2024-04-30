import type {Filter} from '@welshman/util'

export enum FeedType {
  Address = "address",
  Author = "author",
  DVM = "dvm",
  Difference = "difference",
  ID = "id",
  Intersection = "intersection",
  Kind = "kind",
  List = "list",
  WOT = "wot",
  Relay = "relay",
  Scope = "scope",
  Since = "since",
  SinceAgo = "since_ago",
  SymmetricDifference = "symmetric_difference",
  Tag = "tag",
  Union = "union",
  Until = "until",
  UntilAgo = "until_ago",
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

export type AddressFeed = [type: FeedType.Address, ...addresses: string[]]
export type AuthorFeed = [type: FeedType.Author, ...pubkeys: string[]]
export type DVMFeed = [type: FeedType.DVM, ...items: DVMItem[]]
export type DifferenceFeed = [type: FeedType.Difference, ...feeds: Feed[]]
export type IDFeed = [type: FeedType.ID, ...ids: string[]]
export type IntersectionFeed = [type: FeedType.Intersection, ...feeds: Feed[]]
export type KindFeed = [type: FeedType.Kind, ...kinds: number[]]
export type ListFeed = [type: FeedType.List, ...items: ListItem[]]
export type WOTFeed = [type: FeedType.WOT, ...items: WOTItem[]]
export type RelayFeed = [type: FeedType.Relay, ...urls: string[]]
export type ScopeFeed = [type: FeedType.Scope, ...scopes: Scope[]]
export type SinceAgoFeed = [type: FeedType.SinceAgo, since_ago: number]
export type SinceFeed = [type: FeedType.Since, since: number]
export type SymmetricDifferenceFeed = [type: FeedType.SymmetricDifference, ...feeds: Feed[]]
export type TagFeed = [type: FeedType.Tag, key: string, ...values: string[]]
export type UnionFeed = [type: FeedType.Union, ...feeds: Feed[]]
export type UntilAgoFeed = [type: FeedType.UntilAgo, until_ago: number]
export type UntilFeed = [type: FeedType.Until, until: number]

export type Feed =
  AddressFeed |
  AuthorFeed |
  DVMFeed |
  DifferenceFeed |
  IDFeed |
  IntersectionFeed |
  KindFeed |
  ListFeed |
  WOTFeed |
  RelayFeed |
  ScopeFeed |
  SinceAgoFeed |
  SinceFeed |
  SymmetricDifferenceFeed |
  TagFeed |
  UnionFeed |
  UntilAgoFeed |
  UntilFeed

export const addressFeed = (...addresses: string[]): AddressFeed => [FeedType.Address, ...addresses]
export const authorFeed = (...pubkeys: string[]): AuthorFeed => [FeedType.Author, ...pubkeys]
export const dvmFeed = (...items: DVMItem[]): DVMFeed => [FeedType.DVM, ...items]
export const differenceFeed = (...feeds: Feed[]): DifferenceFeed => [FeedType.Difference, ...feeds]
export const idFeed = (...ids: string[]): IDFeed => [FeedType.ID, ...ids]
export const intersectionFeed = (...feeds: Feed[]): IntersectionFeed => [FeedType.Intersection, ...feeds]
export const kindFeed = (...kinds: number[]): KindFeed => [FeedType.Kind, ...kinds]
export const listFeed = (...items: ListItem[]): ListFeed => [FeedType.List, ...items]
export const wotFeed = (...items: WOTItem[]): WOTFeed => [FeedType.WOT, ...items]
export const relayFeed = (...urls: string[]): RelayFeed => [FeedType.Relay, ...urls]
export const scopeFeed = (...scopes: Scope[]): ScopeFeed => [FeedType.Scope, ...scopes]
export const sinceAgoFeed = (since_ago: number): SinceAgoFeed => [FeedType.SinceAgo, since_ago]
export const sinceFeed = (since: number): SinceFeed => [FeedType.Since, since]
export const symmetricDifferenceFeed = (...feeds: Feed[]): SymmetricDifferenceFeed => [FeedType.SymmetricDifference, ...feeds]
export const tagFeed = (key: string, ...values: string[]): TagFeed => [FeedType.Tag, key, ...values]
export const unionFeed = (...feeds: Feed[]): UnionFeed => [FeedType.Union, ...feeds]
export const untilAgoFeed = (until_ago: number): UntilAgoFeed => [FeedType.UntilAgo, until_ago]
export const untilFeed = (until: number): UntilFeed => [FeedType.Until, until]

export const feedsFromFilter = (filter: Filter) => {
  const feeds = []

  for (const [k, v] of Object.entries(filter)) {
    if (k === 'ids') feeds.push(idFeed(...v as string[]))
    else if (k === 'kinds') feeds.push(kindFeed(...v as number[]))
    else if (k === 'authors') feeds.push(authorFeed(...v as string[]))
    else if (k === 'since') feeds.push(sinceFeed(v as number))
    else if (k === 'until') feeds.push(untilFeed(v as number))
    else if (k.startsWith('#')) feeds.push(tagFeed(k as string, ...v as string[]))
    else throw new Error(`Unable to create feed from filter ${k}: ${v}`)
  }

  return feeds
}

export const feedFromFilter = (filter: Filter) => intersectionFeed(...feedsFromFilter(filter))

export const hasSubFeeds = ([type]: [FeedType]) =>
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
