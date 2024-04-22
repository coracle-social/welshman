# @welshman/feeds [![version](https://badgen.feeds/npm/v/@welshman/feeds)](https://npmjs.com/package/@welshman/feeds)

A custom feed compiler and loader for nostr.

# Example

```javascript
// Configure the feed loader so it can access your app's context and make requests
const loader = new FeedLoader({
  request,
  requestDvm,
  getPubkeysForScope,
  getPubkeysForWotRange,
})

// Define a feed using set operations
const feed = intersectionFeed(
  unionFeed(
    dvmFeed({
      kind: 5300,
      pubkey: '19b78ccfa7c5e31e6bacbb3f2a1703f64b62017702e584440bf29a7e16263e8c',
    }),
    listFeed("10003:19ba654f26afd4930fd3d51baf4e26f1413b7aeec7190cd6c0cdf4d2f14cec6b:"),
  )
  filterFeed({
    min_wot: 0.1,
    scopes: ["global"],
  }),
)

// Load notes using the feed
loader.compiler.getLoader(feed, {
  onEvent: event => console.log("Event", event),
  onExhausted: () =>  console.log("Exhausted"),
})
```
