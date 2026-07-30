# Feeds & Search

## Feeds

`app.use(Feeds)` builds `@welshman/feeds` `FeedController`s wired to this app — its router, web-of-trust graph, signer, and net context are all injected for you, so the controller can resolve scopes (`Self`, `Follows`, `Network`, `Followers`) and WoT ranges to real pubkeys and fetch through the app's repository and pool.

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

You provide the `feed` (and typically `onEvent`); the app injects `router`, `signer`, `context`, and the scope/WoT-range resolvers. The scope resolvers map `@welshman/feeds` `Scope` values to pubkeys via [`Wot`](./wot):

- `Scope.Self` → the current user
- `Scope.Follows` → `Wot.follows(pubkey)`
- `Scope.Network` → `Wot.network(pubkey)`
- `Scope.Followers` → `Wot.followers(pubkey)`

WoT-range feeds resolve to the pubkeys whose trust score falls within a fraction of the maximum score, scored against the user's follows rather than the whole repository (`WotScope.Follows`, see [scope](./wot#scope)).

## Search

`app.use(Searches)` provides fuzzy ([Fuse.js](https://fusejs.io)) search over profiles, topics, and relays. Profile search additionally triggers a NIP-50 network search and ranks results by web of trust.

```typescript
import {get} from "svelte/store"

const searches = app.use(Searches)

// Each of these is a Readable<Search<...>> that stays up to date
const profileSearch = get(searches.profileSearch)
const topicSearch = get(searches.topicSearch)
const relaySearch = get(searches.relaySearch)

// A Search exposes both option objects and their values
profileSearch.searchValues("alice")    // string[] — pubkeys; also fires a NIP-50 network search
profileSearch.searchOptions("alice")   // ProfileReader[]
profileSearch.getOption(pubkey)        // ProfileReader | undefined
```

Profile results are ranked by blending the Fuse score with the WoT score, so well-trusted matches surface first. An empty search term returns all options.

### Building your own search

The generic `createSearch` helper underlies the built-in searches and is exported for custom indexes:

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
