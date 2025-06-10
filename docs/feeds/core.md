# Feed Core Types

Core type definitions for the feed system, providing structured ways to query and filter Nostr events.

## Feed Types

```typescript
export enum FeedType {
  Address = "address",
  Author = "author", 
  CreatedAt = "created_at",
  DVM = "dvm",
  Difference = "difference",
  ID = "id",
  Intersection = "intersection",
  Global = "global",
  Kind = "kind",
  List = "list",
  Label = "label",
  WOT = "wot",
  Relay = "relay",
  Scope = "scope",
  Search = "search",
  Tag = "tag",
  Union = "union",
}

export enum Scope {
  Followers = "followers",
  Follows = "follows",
  Network = "network",
  Self = "self",
}
```

## Item Types

```typescript
export type DVMItem = {
  kind: number
  tags?: string[][]
  relays?: string[]
  mappings?: TagFeedMapping[]
}

export type ListItem = {
  addresses: string[]
  mappings?: TagFeedMapping[]
}

export type LabelItem = {
  relays?: string[]
  authors?: string[]
  [key: `#${string}`]: string[]
  mappings?: TagFeedMapping[]
}

export type WOTItem = {
  min?: number
  max?: number
}

export type CreatedAtItem = {
  since?: number
  until?: number
  relative?: string[]
}

export type RequestItem = {
  relays?: string[]
  filters?: Filter[]
}
```

## Feed Definitions

```typescript
export type AddressFeed = [type: FeedType.Address, ...addresses: string[]]
export type AuthorFeed = [type: FeedType.Author, ...pubkeys: string[]]
export type CreatedAtFeed = [type: FeedType.CreatedAt, ...items: CreatedAtItem[]]
export type DVMFeed = [type: FeedType.DVM, ...items: DVMItem[]]
export type DifferenceFeed = [type: FeedType.Difference, ...feeds: Feed[]]
export type IDFeed = [type: FeedType.ID, ...ids: string[]]
export type IntersectionFeed = [type: FeedType.Intersection, ...feeds: Feed[]]
export type GlobalFeed = [type: FeedType.Global, ...feeds: Feed[]]
export type KindFeed = [type: FeedType.Kind, ...kinds: number[]]
export type ListFeed = [type: FeedType.List, ...items: ListItem[]]
export type LabelFeed = [type: FeedType.Label, ...items: LabelItem[]]
export type WOTFeed = [type: FeedType.WOT, ...items: WOTItem[]]
export type RelayFeed = [type: FeedType.Relay, ...urls: string[]]
export type ScopeFeed = [type: FeedType.Scope, ...scopes: Scope[]]
export type SearchFeed = [type: FeedType.Search, ...searches: string[]]
export type TagFeed = [type: FeedType.Tag, key: string, ...values: string[]]
export type UnionFeed = [type: FeedType.Union, ...feeds: Feed[]]

export type Feed = /* union of all feed types */
```
