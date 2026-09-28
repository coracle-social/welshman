# @welshman/feeds

[![version](https://badgen.net/npm/v/@welshman/feeds)](https://npmjs.com/package/@welshman/feeds)

Declarative nostr feeds. A feed is a typed tuple that combines sources such as authors, kinds, tags, lists, DVMs and web of trust with set operations (union, intersection, difference). The package compiles feeds into relay requests and loads them page by page.

Read the spec on [the NIPs repository](https://github.com/nostr-protocol/nips/blob/af4329986cae9b0ef625a01c8cefd5e802ca6895/fe.md).

## What's Included

- **[Core](./core.md)** - Feed types and definitions
- **[Utilities](./utils.md)** - Factories, type guards, conversions and traversal
- **[Compiler](./compiler.md)** - Compiles feeds into relay requests
- **[Controller](./controller.md)** - Loads and listens to feeds

## Quick Example

```typescript
import {
  FeedController,
  makeDVMFeed,
  makeIntersectionFeed,
  makeListFeed,
  makeUnionFeed,
  makeWOTFeed,
} from "@welshman/feeds"

const feed = makeIntersectionFeed(
  makeUnionFeed(
    makeDVMFeed({
      kind: 5300,
      tags: [["p", "19b78ccfa7c5e31e6bacbb3f2a1703f64b62017702e584440bf29a7e16263e8c"]],
    }),
    makeListFeed({
      addresses: ["10003:19ba654f26afd4930fd3d51baf4e26f1413b7aeec7190cd6c0cdf4d2f14cec6b:"],
    }),
  ),
  makeWOTFeed({min: 0.1}),
)

const controller = new FeedController({
  feed,
  router, // a FeedRouter, such as app.use(Router)
  getPubkeysForScope,
  getPubkeysForWOTRange,
  onEvent: event => console.log("Event", event),
  onExhausted: () => console.log("Exhausted"),
})

// Events arrive through onEvent
await controller.load(10)
```

With `@welshman/app`, `app.use(Feeds).makeFeedController({feed, onEvent})` supplies the router, the scope and web-of-trust lookups, the signer and the network context.

## Installation

```bash
npm install @welshman/feeds
```
