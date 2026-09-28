# Routing & Tags

## The Router

`app.use(Router)` is the app's relay router. It resolves routes with:

- **the user's pubkey** from `app.user`
- **read, write and NIP-17 messaging relays** per pubkey from [`RelayLists`](./data#relay-lists) and `MessagingRelayLists`
- **relay quality** from [`RelayStats`](#relay-quality)
- **default, indexer and search relays** from [`AppConfig`](./app#appconfig)

Routing is declarative. Code describes *sources* as `RelaySelection`s ("the author's outbox", "this pubkey's inbox", "the relays this event was seen on"), and the router resolves them into concrete urls:

```typescript
const router = app.use(Router)

router.resolver              // a @welshman/util Resolver
router.resolve(selections)   // router.resolver.scenario(selections), a Promise<RelayScenario>
```

`resolver` is built with `getRelayQuality` from `RelayStats` and `getDefaultRelays` from `AppConfig`. The same resolver is injected into every domain kind by [`app.use(Domain)`](./plugins#the-domain-plugin), so writers and the router route alike. `Router` also implements `@welshman/feeds`' `FeedRouter`, which is how [feed controllers](./feeds-and-search#feeds) route their filters.

`router.resolveRoute(route)` dereferences a single `RelayRoute`:

- `userInbox` / `userOutbox` / `userMessaging` → the signed-in user's read / write / NIP-17 relays, or none when signed out.
- `pubkeyInbox` / `pubkeyOutbox` / `pubkeyMessaging` → that pubkey's relays (via `RelayLists` / `MessagingRelayLists`).
- `eventInbox` / `eventOutbox` → the relays of `ref.pubkey`, and of the author of `ref.id` when the repository has that event, merged with any `ref.relays` hints.
- `seen` → the tracker's relays for the event id (or, for a replaceable ref, the id of the event at its address), plus `ref.relays` hints.
- `index` → `AppConfig.getIndexerRelays()`; `search` → `AppConfig.getSearchRelays()`.
- `relay` → the literal `route.url`.

### The RelaySelection DSL

`@welshman/util` exports constructors that build `RelaySelection`s, each pairing a `RelayRoute` with a `weight` (default `1`). `relays` and `inboxes` return arrays:

```typescript
import {
  inbox, outbox, messaging,
  userInbox, userOutbox, userMessaging,
  eventInbox, eventOutbox, seen,
  relay, relays, inboxes,
  indexers, searchRelays,
} from "@welshman/util"

inbox(pubkey)             // that pubkey's read relays (deliver here so they receive)
outbox(pubkey)            // that pubkey's write relays (their events live here)
messaging(pubkey)         // that pubkey's NIP-17 relays
userOutbox()              // the current user's write relays
eventOutbox(ref)          // the author of a referenced event
seen(ref)                 // relays a given event was found on
relay(url)                // a literal relay url
relays(urls)              // one selection per url  -> RelaySelection[]
inboxes(pubkeys, 0.5)     // one weighted inbox per pubkey -> RelaySelection[]
indexers()                // profile/relay-list index relays
searchRelays()            // full-text search relays
```

A selection list resolves to a scored `RelayScenario`, and the scenario to urls:

```typescript
import {addMinimalFallbacks} from "@welshman/util"

const scenario = await app.use(Router).resolve([
  userOutbox(),
  ...inboxes(mentionedPubkeys, 0.5),
])

const urls = scenario.policy(addMinimalFallbacks).limit(8).getUrls()
const hint = scenario.getUrl()
```

Scoring, the `limit`/`policy`/`allow*` options and the fallback policies are documented under [RelayScenario](../util/relay#relayscenario).

### Routes from domain writers

Each [`@welshman/domain`](../domain/) writer computes its own `RelaySelection`s. `writer.scenario()` resolves them through the injected resolver, and `writer.relays()` returns the urls. The default is the author's outbox plus the inbox of every p-tagged pubkey, and kinds override it, as described in [Routing a writer](../domain/readers-and-writers#routing-a-writer).

### Forced routes

A writer with forced routes publishes only there, bypassing outbox and inbox routing:

```typescript
writer.forceRoutes(relay("wss://relay.example.com/"))  // publish only here
writer.forceRoutes(userInbox())                         // any route, resolved at render
writer.setRoom("wss://rooms.example.com/", roomId)      // forced route plus an "h" tag
```

NIP-29 room ops and relay-management ops require explicit relays, so `render()` throws unless `setRoom` or `forceRoutes` was called.

## Relay quality

`app.use(RelayStats)` collects per-relay connection statistics (open, close, publish, request and event counts, timestamps, recent errors) and exposes the quality score the router ranks relays by.

```typescript
const stats = app.use(RelayStats)

stats.one(url)                 // Readable<Maybe<RelayStatsItem>>
stats.getQuality(url)          // number in [0, 1] — 0 for blocked/error-prone relays
```

The [`appPolicyRelayStats`](./app#default-policies) default policy fills the stats. `getQuality` returns `0` for non-relay urls, relays in the user's [blocked list](./data#specialized-relay-lists), and error-prone relays, and higher scores for relays that are connected or have been seen before. The scenario drops a relay that scores `0`.

## Tags & relay hints

Domain writers build their own tags, including relay hints. A helper that adds a tag with a relay hint resolves the hint through the resolver in the background, and `renderTags()` waits for it before returning. The helpers are listed under [EventWriter](../domain/readers-and-writers#eventwriter). A typical reply:

```typescript
import {Note} from "@welshman/domain"

const writer = app.use(Domain)
  .writer(Note)
  .setContent("well said")
  .setParent(parentEvent)   // NIP-10 threading, with relay hints

const command = await app.use(Domain).command(writer)

await command.publish()
```
