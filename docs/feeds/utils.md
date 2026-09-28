# Feed Utilities

Helpers for creating, type-checking, converting and traversing feed definitions.

## Feed Factory Functions

```typescript
// Basic Feeds
const authors = makeAuthorFeed("pubkey1", "pubkey2")
const kinds = makeKindFeed(1, 6)
const search = makeSearchFeed("bitcoin", "nostr")
const global = makeGlobalFeed()

// Time-based Feeds: with `relative`, since is seconds before now
const recent = makeCreatedAtFeed({
  since: DAY,
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

```typescript
const feed: Feed = makeDVMFeed({ kind: 5300 })

if (isDVMFeed(feed)) {
  // feed is typed as DVMFeed
  const [item] = getFeedArgs(feed)
  const kind = item.kind
}

if (hasSubFeeds(feed)) {
  // feed is typed as UnionFeed | IntersectionFeed | DifferenceFeed
  const subFeeds = getFeedArgs(feed)
}
```

## Feed Transformations

### Tag to Feed Conversion

```typescript
// Used when no mappings are passed
const defaultTagFeedMappings: TagFeedMapping[] = [
  ["a", [FeedType.Address]],   // address tags
  ["e", [FeedType.ID]],        // event references
  ["p", [FeedType.Author]],    // people/pubkeys
  ["r", [FeedType.Relay]],     // relay URLs
  ["t", [FeedType.Tag, "#t"]], // hashtags
]

const tags = [["p", "pubkey1"], ["t", "bitcoin"]]
const feeds = feedsFromTags(tags)
// => [[FeedType.Author, "pubkey1"], [FeedType.Tag, "#t", "bitcoin"]]

const feed = feedFromTags(tags)
// => [FeedType.Intersection, [FeedType.Author, "pubkey1"], [FeedType.Tag, "#t", "bitcoin"]]
```

### Filter to Feed Conversion

```typescript
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

// An intersection feed, or the single feed when there is only one
const feed = feedFromFilter(filter)

// A union feed, or the single feed when there is only one
const feeds = feedFromFilters([filter1, filter2])
```

## Feed Traversal

`walkFeed` visits every node of a feed tree:

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

`findFeed` returns the first node that matches:

```typescript
const feed = makeIntersectionFeed(
  makeAuthorFeed("pubkey1"),
  makeUnionFeed(
    makeKindFeed(1),
    makeTagFeed("#t", "bitcoin")
  )
)

const bitcoinTagFeed = findFeed(feed, (f) =>
  isTagFeed(f) && getFeedArgs(f)[1] === "bitcoin"
)
```

## Feed Simplification

`simplifyFeed` flattens set operations nested inside one of the same type, and replaces a set operation with a single sub-feed by that sub-feed.

```typescript
const nested = makeUnionFeed(
  makeAuthorFeed("pubkey1"),
  makeUnionFeed(makeKindFeed(1), makeKindFeed(6))
)

const simplified = simplifyFeed(nested)
// Result: [FeedType.Union, [FeedType.Author, "pubkey1"], [FeedType.Kind, 1], [FeedType.Kind, 6]]
```

## Type Extraction

```typescript
function getFeedArgs(feed: IntersectionFeed | UnionFeed | DifferenceFeed): Feed[]
function getFeedArgs(feed: AuthorFeed): string[]
function getFeedArgs(feed: CreatedAtFeed): CreatedAtItem[]
function getFeedArgs(feed: WOTFeed): WOTItem[]
// ... and so on for each feed type

const feed = makeAuthorFeed("pubkey1", "pubkey2")
const pubkeys = getFeedArgs(feed) // => ["pubkey1", "pubkey2"]
```

## Best Practices

Build feeds with the factory functions rather than raw arrays, so that each tuple is typed:

```typescript
// Good
const feed = makeAuthorFeed("pubkey1")

// Avoid
const feed = [FeedType.Author, "pubkey1"]
```
