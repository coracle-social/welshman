# Feed Types and Core Definitions

This module defines the core types and structures used to build Nostr feeds.
It provides a type-safe way to define complex feed compositions using various filtering mechanisms and set operations.

## Feed Types

```typescript
enum FeedType {
  Address = "address",     // Filter by event addresses
  Author = "author",       // Filter by author pubkeys
  CreatedAt = "created_at", // Filter by timestamp
  DVM = "dvm",            // Data Vending Machine based feed
  Difference = "difference", // Set difference operation
  ID = "id",              // Filter by event IDs
  Intersection = "intersection", // Set intersection operation
  Global = "global",      // Global feed (no filters)
  Kind = "kind",          // Filter by event kinds
  List = "list",          // List-based feed
  Label = "label",        // Label-based feed
  WOT = "wot",           // Web of Trust based feed
  Relay = "relay",        // Relay-specific feed
  Scope = "scope",        // Scoped feed (followers, network)
  Search = "search",      // Search-based feed
  Tag = "tag",           // Filter by specific tags
  Union = "union"         // Set union operation
}
```

## Scope Types

```typescript
enum Scope {
  Followers = "followers", // People who follow the user
  Follows = "follows",    // People the user follows
  Network = "network",    // Extended network
  Self = "self"          // The signed in user
}
```

## Feed Definitions

Each feed type has its own structure:

### Basic Filter Feeds

```typescript
type AddressFeed = [type: FeedType.Address, ...addresses: string[]]
type AuthorFeed = [type: FeedType.Author, ...pubkeys: string[]]
type IDFeed = [type: FeedType.ID, ...ids: string[]]
type KindFeed = [type: FeedType.Kind, ...kinds: number[]]
type TagFeed = [type: FeedType.Tag, key: string, ...values: string[]]
```

### Time-based Feeds

```typescript
type CreatedAtItem = {
  since?: number
  until?: number
  relative?: string[]  // For relative time references
}
type CreatedAtFeed = [type: FeedType.CreatedAt, ...items: CreatedAtItem[]]
```

### Advanced Filter Feeds

```typescript
// DVM-based feed
type DVMItem = {
  kind: number
  tags?: string[][]
  relays?: string[]
  mappings?: TagFeedMapping[]
}
type DVMFeed = [type: FeedType.DVM, ...items: DVMItem[]]

// List-based feed
type ListItem = {
  addresses: string[]
  mappings?: TagFeedMapping[]
}
type ListFeed = [type: FeedType.List, ...items: ListItem[]]

// Label-based feed
type LabelItem = {
  relays?: string[]
  authors?: string[]
  [key: `#${string}`]: string[]
  mappings?: TagFeedMapping[]
}
type LabelFeed = [type: FeedType.Label, ...items: LabelItem[]]

// Web of Trust feed
type WOTItem = {
  min?: number
  max?: number
}
type WOTFeed = [type: FeedType.WOT, ...items: WOTItem[]]
```

## Tag Feed Mapping

`TagFeedMapping` is a mechanism to convert event tags into feed definitions. It's particularly useful when working with DVMs, Lists, and Labels where you want to interpret tags in a specific way.

```typescript
type TagFeedMapping = [string, Feed]
```

### Usage
```typescript
// Example mappings
const mappings: TagFeedMapping[] = [
  // Convert 'p' tags into author feeds
  ["p", [FeedType.Author]],

  // Convert 't' tags into hashtag filters
  ["t", [FeedType.Tag, "#t"]],

  // Convert 'e' tags into event ID feeds
  ["e", [FeedType.ID]],

  // Convert 'r' tags into relay feeds
  ["r", [FeedType.Relay]]
]

// Using mappings in a DVM feed
const dvmFeed: Feed = [
  FeedType.DVM,
  {
    kind: 5300,
    mappings: mappings
  }
]

// Using mappings in a List feed
const listFeed: Feed = [
  FeedType.List,
  {
    addresses: ["list_id"],
    mappings: mappings
  }
]
```

### Default Mappings
The system comes with default mappings for common tags:
```typescript
const defaultTagFeedMappings: TagFeedMapping[] = [
  ["a", [FeedType.Address]],   // Address references
  ["e", [FeedType.ID]],        // Event references
  ["p", [FeedType.Author]],    // Person/Pubkey references
  ["r", [FeedType.Relay]],     // Relay references
  ["t", [FeedType.Tag, "#t"]], // Hashtags
]
```

## Set Operation Feeds

### Union Feed
A Union feed combines multiple feeds with an OR operation. Events matching any of the constituent feeds will be included.

```typescript
type UnionFeed = [type: FeedType.Union, ...feeds: Feed[]]

// Example: Events from either Alice OR Bob
const unionFeed: UnionFeed = [
  FeedType.Union,
  [FeedType.Author, "alice_pubkey"],
  [FeedType.Author, "bob_pubkey"]
]

// Example: Events from a list OR matching a search term
const complexUnion: UnionFeed = [
  FeedType.Union,
  [FeedType.List, { addresses: ["trending_list"] }],
  [FeedType.Search, "bitcoin"]
]
```

### Intersection Feed
An Intersection feed combines multiple feeds with an AND operation. Only events that match all constituent feeds will be included.

```typescript
type IntersectionFeed = [type: FeedType.Intersection, ...feeds: Feed[]]

// Example: Text notes (kind 1) from trusted authors
const intersectionFeed: IntersectionFeed = [
  FeedType.Intersection,
  [FeedType.Kind, 1],
  [FeedType.WOT, { min: 0.5 }]
]

// Example: Recent posts from followed users
const timeAndScope: IntersectionFeed = [
  FeedType.Intersection,
  [FeedType.CreatedAt, { since: Date.now() - 86400000 }], // Last 24h
  [FeedType.Scope, Scope.Follows]
]
```

### Difference Feed
A Difference feed excludes events from the second feed from the first feed (NOT operation).

```typescript
type DifferenceFeed = [type: FeedType.Difference, ...feeds: Feed[]]

// Example: Posts from everyone except blocked users
const differenceFeed: DifferenceFeed = [
  FeedType.Difference,
  [FeedType.Global], // All events
  [FeedType.List, { addresses: ["blocked_users"] }] // Except from blocked users
]

// Example: Posts from follows except reposts
const noReposts: DifferenceFeed = [
  FeedType.Difference,
  [FeedType.Scope, Scope.Follows],
  [FeedType.Kind, 6] // Kind 6 is repost
]
```

### Complex Combinations

You can nest set operations to create sophisticated feed definitions:

```typescript
// Posts that are either:
// - from trusted authors AND about bitcoin
// - OR from a curated list
const complexFeed: Feed = [
  FeedType.Union,
  [
    FeedType.Intersection,
    [FeedType.WOT, { min: 0.7 }],
    [FeedType.Search, "bitcoin"]
  ],
  [FeedType.List, { addresses: ["curated_content"] }]
]

// Posts that are:
// - from follows
// - AND (from the last 24h OR highly rated by DVMs)
// - AND NOT marked as sensitive content
const advancedFeed: Feed = [
  FeedType.Difference,
  [
    FeedType.Intersection,
    [FeedType.Scope, Scope.Follows],
    [
      FeedType.Union,
      [FeedType.CreatedAt, { since: Date.now() - 86400000 }],
      [FeedType.DVM, { kind: 5300, pubkey: "rating_dvm" }]
    ]
  ],
  [FeedType.Label, { authors: ["content_warning_dvm"] }]
]
```

## Feed Controller Options

The `FeedOptions` interface defines the configuration required to execute a feed:

```typescript
interface FeedOptions {
  // The feed definition to execute
  feed: Feed

  // Function to request events from relays
  request: (opts: RequestOpts) => Promise<void>

  // Function to request events from DVMs
  requestDVM: (opts: DVMOpts) => Promise<void>

  // Function to get pubkeys for a given scope
  getPubkeysForScope: (scope: Scope) => string[]

  // Function to get pubkeys within a WOT range
  getPubkeysForWOTRange: (minWOT: number, maxWOT: number) => string[]

  // Event handler
  onEvent?: (event: TrustedEvent) => void

  // Called when feed is exhausted
  onExhausted?: () => void

  // Enable time-window based loading
  useWindowing?: boolean

  // Optional abort controller
  abortController?: AbortController
}
```

## Examples

### Simple Author Feed
```typescript
const authorFeed: Feed = [FeedType.Author, "pubkey1", "pubkey2"]
```

### Time-filtered Feed
```typescript
const recentFeed: Feed = [
  FeedType.CreatedAt,
  {
    since: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
    relative: ["since"]
  }
]
```

### Complex Feed Composition
```typescript
const complexFeed: Feed = [
  FeedType.Intersection,
  [FeedType.Kind, 1], // Text notes
  [FeedType.WOT, { min: 0.5 }], // Trusted authors
  [
    FeedType.Union,
    [FeedType.Scope, Scope.Follows], // From follows
    [FeedType.List, { addresses: ["list_id"] }] // Or from list
  ]
]
```

### DVM Feed with Mappings
```typescript
const dvmFeed: Feed = [
  FeedType.DVM,
  {
    kind: 5300,
    mappings: [
      ["p", [FeedType.Author]], // Map 'p' tags to authors
      ["t", [FeedType.Tag, "#t"]] // Map 't' tags to hashtags
    ]
  }
]
```

This core module provides the foundation for building complex, type-safe feed definitions that can be executed by the feed controller.
