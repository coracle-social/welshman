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

export type TagFeedMapping = [string, Feed]

export type DVMItem = {
  kind: number,
  tags?: string[][],
  relays?: string[],
  mappings?: TagFeedMapping[],
}

export type ListItem = {
  addresses: string[],
  mappings?: TagFeedMapping[],
}

export type WOTItem = {
  min?: number,
  max?: number,
}

export type CreatedAtItem = {
  since?: number,
  until?: number,
  relative?: string[],
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
  requestDVM: (opts: DVMOpts<E>) => Promise<void>
  getPubkeysForScope: (scope: Scope) => string[]
  getPubkeysForWOTRange: (minWOT: number, maxWOT: number) => string[]
}
