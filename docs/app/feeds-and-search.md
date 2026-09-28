# Feeds & Search

## Feeds

`app.use(Feeds)` builds `@welshman/feeds` `FeedController`s wired to this app's router, web-of-trust graph, signer, pool and repository, so a controller resolves scopes and WoT ranges to pubkeys and fetches through the app.

```typescript
import {makeIntersectionFeed, makeScopeFeed, makeKindFeed, Scope} from "@welshman/feeds"

const controller = app.use(Feeds).makeFeedController({
  feed: makeIntersectionFeed(
    makeScopeFeed(Scope.Follows),
    makeKindFeed(1),
  ),
  onEvent: event => {
    // render the event
  },
})

await controller.load(50)   // load a page of 50
```

### `MakeFeedControllerOptions`

```typescript
type MakeFeedControllerOptions = Partial<Omit<FeedControllerOptions, "feed">> & {feed: Feed}
```

The caller provides the `feed` and usually `onEvent`. The app injects `router`, `signer`, `context`, and the scope and WoT-range resolvers. The scope resolvers map `Scope` values to pubkeys through [`Wot`](./wot), and resolve to none when signed out:

- `Scope.Self` → the current user
- `Scope.Follows` → `Wot.follows(pubkey)`
- `Scope.Network` → `Wot.network(pubkey)`
- `Scope.Followers` → `Wot.followers(pubkey, WotScope.Global)`

A WoT-range feed resolves to the pubkeys whose score falls within a fraction of the maximum score, scored with [`WotScope.Follows`](./wot#scope).

## Search

Fuzzy ([Fuse.js](https://fusejs.io)) search lives on the plugin that owns the data: `Profiles.profileSearch`, `Topics.topicSearch`, and `Relays.relaySearch`. Each is a `Readable<Search<...>>` that rebuilds as the collection changes. Profile search also fires a NIP-50 network search and ranks results by web of trust.

```typescript
import {get} from "svelte/store"

const profileSearch = get(app.use(Profiles).profileSearch)
const topicSearch = get(app.use(Topics).topicSearch)
const relaySearch = get(app.use(Relays).relaySearch)

// A Search exposes both option objects and their values
profileSearch.searchValues("alice")    // string[] — pubkeys; also fires a NIP-50 network search
profileSearch.searchOptions("alice")   // ProfileReader[]
profileSearch.getOption(pubkey)        // ProfileReader | undefined
```

Profile results blend the Fuse score with the `WotScope.Follows` score, so well-trusted matches come first. An empty search term returns all options.

### Building your own search

`createSearch` builds the built-in searches and is exported for custom indexes:

```typescript
import {createSearch} from "@welshman/app"

const search = createSearch(items, {
  getValue: item => item.id,                 // map an item to its identifier
  fuseOptions: {keys: ["name", "about"], threshold: 0.3},
  onSearch: term => {/* e.g. trigger a network fetch */},
  sortFn: results => results,                // optional custom result ordering
})

search.searchOptions("query")               // T[]
search.searchValues("query")                 // V[]
search.getOption(value)                      // T | undefined
```
