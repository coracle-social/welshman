# @welshman/feeds

[![version](https://badgen.net/npm/v/@welshman/feeds)](https://npmjs.com/package/@welshman/feeds)

A package for building and executing dynamic Nostr feeds which provides a declarative way to define complex feed compositions using set operations (union, intersection, difference) and various filtering mechanisms.

Read the spec on [the NIPs repository](https://github.com/nostr-protocol/nips/blob/af4329986cae9b0ef625a01c8cefd5e802ca6895/fe.md).

## What's Included

- **Feed Core** - Declarative feed definition with composable operations
- **Feed Compiler** - Transforms feed definitions into optimized relay requests
- **Feed Controller** - Manages feed execution and event loading
- **Feed Utils** - Helper functions for creating and manipulating feeds
- **Feed Types** - Supports authors, kinds, tags, DVMs, lists, WOT, and more

## Quick Example

```javascript
// Define a feed using set operations
const feed = intersectionFeed(
  unionFeed(
    dvmFeed({
      kind: 5300,
      pubkey: '19b78ccfa7c5e31e6bacbb3f2a1703f64b62017702e584440bf29a7e16263e8c',
    }),
    listFeed("10003:19ba654f26afd4930fd3d51baf4e26f1413b7aeec7190cd6c0cdf4d2f14cec6b:"),
  )
  wotFeed({min: 0.1}),
  scopeFeed("global"),
)

// Create a controller, providing required context via FeedOptions
const controller = new FeedController({
  feed,
  request,
  requestDVM,
  getPubkeysForScope,
  getPubkeysForWOTRange,
  onEvent: event => console.log("Event", event),
  onExhausted: () => console.log("Exhausted"),
})

// Load notes using the feed
const events = await controller.load(10)
```

## Installation

```bash
npm install @welshman/feeds
```
