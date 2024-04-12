
import {inc, now, isNil} from '@coracle.social/lib'
import type {Rumor, Filter} from '@coracle.social/util'
import {Tags, getIdFilters, mergeFilters} from '@coracle.social/util'

export enum FeedType {
  Difference = "\\",
  Intersection = "∩",
  SymmetricDifference = "Δ",
  Union = "∪",
  Filter = "filter",
  Relay = "relay",
  List = "list",
  LOL = "lol",
  DVM = "dvm",
}

export enum Scope {
  Self = "self",
  Follows = "follows",
  Followers = "followers",
}

export type DynamicFilter = Filter & {
  scopes?: Scope[]
  min_wot?: number
  max_wot?: number
  until_ago?: number
  since_ago?: number
}

export type DVMRequest = {
  kind: number
  tags?: string[][]
}

export type DifferenceFeed = [FeedType.Difference, ...Feed[]]
export type IntersectionFeed = [FeedType.Intersection, ...Feed[]]
export type SymmetricDifferenceFeed = [FeedType.SymmetricDifference, ...Feed[]]
export type UnionFeed = [FeedType.Union, ...Feed[]]
export type FilterFeed = [FeedType.Filter, ...DynamicFilter[]]
export type RelayFeed = [FeedType.Relay, ...string[]]
export type ListFeed = [FeedType.List, ...string[]]
export type LOLFeed = [FeedType.LOL, ...string[]]
export type DVMFeed = [FeedType.DVM, ...DVMRequest[]]

export type Feed =
  DifferenceFeed |
  IntersectionFeed |
  SymmetricDifferenceFeed |
  UnionFeed |
  FilterFeed |
  RelayFeed |
  ListFeed |
  LOLFeed |
  DVMFeed

export const difference = (...feeds: Feed[]) =>
  [FeedType.Difference, ...feeds] as DifferenceFeed
export const intersection = (...feeds: Feed[]) =>
  [FeedType.Intersection, ...feeds] as IntersectionFeed
export const symmetricDifference = (...feeds: Feed[]) =>
  [FeedType.SymmetricDifference, ...feeds] as SymmetricDifferenceFeed
export const union = (...feeds: Feed[]) =>
  [FeedType.Union, ...feeds] as UnionFeed
export const filter = (...filters: DynamicFilter[]) =>
  [FeedType.Filter, ...filters] as FilterFeed
export const relay = (...relays: string[]) =>
  [FeedType.Relay, ...relays] as RelayFeed
export const list = (...addresses: string[]) =>
  [FeedType.List, ...addresses] as ListFeed
export const lol = (...addresses: string[]) =>
  [FeedType.LOL, ...addresses] as LOLFeed
export const dvm = (...requests: DVMRequest[]) =>
  [FeedType.DVM, ...requests] as DVMFeed
