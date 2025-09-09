# Feed Utilities

The utils module provides helper functions for creating, type-checking, and manipulating feed definitions. It includes factory functions, type guards, feed transformation utilities, and feed traversal tools.

## Feed Factory Functions

Create strongly-typed feed definitions:

```typescript
// Basic Feeds
const authors = makeAuthorFeed("pubkey1", "pubkey2")
const kinds = makeKindFeed(1, 6)
const search = makeSearchFeed("bitcoin", "nostr")
const global = makeGlobalFeed()

// Time-based Feeds
const recent = makeCreatedAtFeed({
  since: Date.now() - 86400000,
  relative: ["since"]
})

// Advanced Feeds
const dvm = makeDVMFeed({
  kind: 5300,
  mappings: [["p", [FeedType.Author]]]
})

const list = makeListFeed({
  addresses: ["list_id"],
  mappings: [["t", [FeedType.Tag, "#t"]]]
})

// Set Operations
const union = makeUnionFeed(authors, kinds)
const intersection = makeIntersectionFeed(authors, recent)
const difference = makeDifferenceFeed(global, authors)
```

## Type Guards

Check feed types safely:

```typescript
const feed: Feed = makeDVMFeed({ kind: 5300 })

if (isDVMFeed(feed)) {
  // feed is now typed as DVMFeed
  const [item] = getFeedArgs(feed)
  const kind = item.kind
}

if (hasSubFeeds(feed)) {
  // feed is now typed as UnionFeed | IntersectionFeed | DifferenceFeed
  const subFeeds = getFeedArgs(feed)
}
```

## Feed Transformations

### Tag to Feed Conversion

```typescript
// Default tag mappings
const defaultTagFeedMappings: TagFeedMapping[] = [
  ["a", [FeedType.Address]],   // address tags
  ["e", [FeedType.ID]],        // event references
  ["p", [FeedType.Author]],    // people/pubkeys
  ["r", [FeedType.Relay]],     // relay URLs
  ["t", [FeedType.Tag, "#t"]], // hashtags
]

// Convert event tags to feeds
const tags = [["p", "pubkey1"], ["t", "bitcoin"]]
const feeds = feedsFromTags(tags)
// => [[FeedType.Author, "pubkey1"], [FeedType.Tag, "#t", "bitcoin"]]

// Convert tags to a single intersection feed
const feed = feedFromTags(tags)
// => [FeedType.Intersection, [FeedType.Author, "pubkey1"], [FeedType.Tag, "#t", "bitcoin"]]
```

### Filter to Feed Conversion

```typescript
// Convert a single filter to feeds
const filter = {
  kinds: [1],
  authors: ["pubkey1"],
  "#t": ["bitcoin"],
  since: 1234567890
}

const feeds = feedsFromFilter(filter)
// => [
//   [FeedType.CreatedAt, { since: 1234567890 }],
//   [FeedType.Kind, 1],
//   [FeedType.Author, "pubkey1"],
//   [FeedType.Tag, "#t", "bitcoin"]
// ]

// Convert a filter to an intersection feed
const feed = feedFromFilter(filter)

// Convert multiple filters to a union feed
const feeds = feedFromFilters([filter1, filter2])
```

## Feed Traversal

Walk through a feed tree and visit each node:

```typescript
const feed = makeIntersectionFeed(
  makeAuthorFeed("pubkey1"),
  makeUnionFeed(
    makeKindFeed(1),
    makeTagFeed("#t", "bitcoin")
  )
)

walkFeed(feed, (node) => {
  console.log(`Visiting feed of type: ${node[0]}`)
})
```

Find a specific feed in a feed tree:

```typescript
const feed = makeIntersectionFeed(
  makeAuthorFeed("pubkey1"),
  makeUnionFeed(
    makeKindFeed(1),
    makeTagFeed("#t", "bitcoin")
  )
)

// Find a feed matching a specific condition
const bitcoinTagFeed = findFeed(feed, (f) =>
  isTagFeed(f) && getFeedArgs(f)[1] === "bitcoin"
)
```

## Feed Simplification

Flatten nested feeds of the same type:

```typescript
// Simplifies nested feeds of the same type
export declare const simplifyFeed: (feed: Feed) => Feed

// Example: flatten nested union feeds
const nested = makeUnionFeed(
  makeAuthorFeed("pubkey1"),
  makeUnionFeed(makeKindFeed(1), makeKindFeed(6))
)

const simplified = simplifyFeed(nested)
// Result: [FeedType.Union, [FeedType.Author, "pubkey1"], [FeedType.Kind, 1], [FeedType.Kind, 6]]
```

## Type Extraction

Get typed arguments from feeds:

```typescript
function getFeedArgs(feed: IntersectionFeed): Feed[]
function getFeedArgs(feed: AuthorFeed): string[]
function getFeedArgs(feed: CreatedAtFeed): CreatedAtItem[]
function getFeedArgs(feed: WOTFeed): WOTItem[]
// ... and so on for each feed type

const feed = makeAuthorFeed("pubkey1", "pubkey2")
const pubkeys = getFeedArgs(feed) // => ["pubkey1", "pubkey2"]
```

## Best Practices

1. Use factory functions instead of raw arrays:
   ```typescript
   // Good
   const feed = makeAuthorFeed("pubkey1")

   // Avoid
   const feed = [FeedType.Author, "pubkey1"]
   ```

2. Use type guards for safe type narrowing:
   ```typescript
   if (isAuthorFeed(feed)) {
     const pubkeys = getFeedArgs(feed) // Properly typed
   }
   ```

3. Use feed transformations for dynamic feed creation:
   ```typescript
   // Convert event tags to feeds
   const feeds = feedsFromTags(event.tags)

   // Convert filters to feeds
   const feed = feedFromFilter(filter)
   ```

4. Use feed traversal for analysis or transformation:
   ```typescript
   const kinds = new Set<number>()
   walkFeed(feed, (node) => {
     if (isKindFeed(node)) {
       getFeedArgs(node).forEach(k => kinds.add(k))
     }
   })
   ```
