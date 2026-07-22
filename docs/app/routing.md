# Routing & Tags

## The Router

`app.use(Router)` is a per-app `Router` wired to this app's data. It is the single source for relay selection — there is no global `Router.get()`; one router belongs to each app.

The app wires it up with:

- **user pubkey** from `app.user`
- **read/write relays** per pubkey from [`RelayLists`](./data#relay-lists) (and NIP-17 messaging relays from `MessagingRelayLists`)
- **relay quality** from [`RelayStats`](#relay-quality)
- **default / indexer / search relays** from [`AppConfig`](./appappconfig)

Routing is declarative. Rather than build a relay set imperatively, code produces a list of `RelaySelection`s — descriptions of *sources* ("the author's outbox", "this pubkey's inbox", "the relays this event was seen on") — and the router resolves them into concrete urls. The `Router` exposes two members:

```typescript
const router = app.use(Router)

router.resolver   // a @welshman/util Resolver: dereferences routes -> urls
router.resolve(selections)   // = router.resolver.scenario(selections) -> Promise<RelayScenario>
```

`resolver` is a `Resolver` (from `@welshman/util`) built with the app's `getRelayQuality` (from `RelayStats`) and `getDefaultRelays` (from `AppConfig`). It is the same resolver injected into every domain kind via `app.use(Domain)`, so a writer's routing and the router's own routing agree.

`resolveRoute(route)` is the underlying function that dereferences a single `RelayRoute`:

- `userInbox` / `userOutbox` / `userMessaging` → the signed-in user's read / write / NIP-17 relays.
- `pubkeyInbox` / `pubkeyOutbox` / `pubkeyMessaging` → that pubkey's relays (via `RelayLists` / `MessagingRelayLists`).
- `eventInbox` / `eventOutbox` → resolve the referenced event's author, then its relays, merged with any `ref.relays` hints.
- `seen` → the tracker's relays for the event id (or, for a replaceable ref, the resolved address's id), plus `ref.relays` hints.
- `index` → `AppConfig.getIndexerRelays()`; `search` → `AppConfig.getSearchRelays()`.
- `relay` → the literal `route.url`.

### The RelaySelection DSL

`@welshman/util` exports a small set of constructors that build `RelaySelection`s (each pairs a `RelayRoute` with a `weight`, default `1`). Most return a single selection; `relays`, `inboxes` return an array (spread them with `...`):

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

`relay` / `relays` replace the old `relayHint` / `relayHints`. Resolve a selection list to a scored scenario, then to urls:

```typescript
import {addMinimalFallbacks} from "@welshman/util"

const scenario = await app.use(Router).resolve([
  userOutbox(),
  ...inboxes(mentionedPubkeys, 0.5),
])

const urls = scenario.policy(addMinimalFallbacks).limit(8).getUrls()
const hint = scenario.getUrl()
```

A `RelayScenario` is chainable — `.limit(n)`, `.policy(fn)`, `.allowLocal(bool)`, `.allowOnion(bool)`, `.allowInsecure(bool)` — and terminates in `getUrls()` / `getUrl()`. It accumulates weight per relay, filters onion/local/insecure relays unless allowed, scores by relay quality (with noise), takes the best `limit`, then tops up from the default relays per the fallback policy (`addNoFallbacks` / `addMinimalFallbacks` / `addMaximalFallbacks`).

### Routes from domain writers

You rarely assemble selections by hand. Each [`@welshman/domain`](./data) kind knows how to route itself. A writer computes its `RelaySelection`s in `renderRoutes()` (a protected override point); `scenario()` resolves them through the injected resolver and `relays()` returns the final urls:

```typescript
const writer = app.use(Domain).writer(Note).setContent("gm")

await writer.scenario()    // RelayScenario  — resolved & scored
await writer.relays()      // string[]       — final urls
```

The default `EventWriter.renderRoutes()` is the author's outbox plus every p-tagged pubkey's inbox:

```typescript
return [userOutbox(), ...inboxes(tagValues(hexTags("p"), await this.renderTags()), 0.5)]
```

Individual kinds override it. For example `FollowListWriter` / `MuteListWriter` route only to `[userOutbox()]` (their p-tags are data, not recipients); `RelayListWriter` adds `indexers()` and notifies every relay added to or removed from the list; `DeleteWriter` adds a `seen(...)` selection for each deleted event.

Routing is a writer concern — readers are getter-only and do not compute routes. Where to *fetch* a kind's events is decided by the request/loader layer, not the reader.

### forcedRelays

Some events must publish to explicit relays, bypassing outbox/inbox routing. When a writer's `forcedRelays` is non-empty, `scenario()` publishes **only** there (`relays(forcedRelays)`):

```typescript
writer.forceRelays("wss://relay.example.com/")  // publish only here
writer.setGroup("wss://groups.example.com/", groupId)  // forcedRelays + an "h" tag
```

NIP-29 room ops and relay-management ops set `requiresRelays = true`, so their `validate()` throws unless `forcedRelays` is set (via `setGroup` or `forceRelays`).

## Relay quality

`app.use(RelayStats)` collects per-relay connection statistics (open/close/publish/request/event counts, timestamps, recent errors) and exposes a quality score the router uses to rank relays.

```typescript
const stats = app.use(RelayStats)

stats.one(url)                 // Readable<Maybe<RelayStatsItem>>
stats.getQuality(url)          // number in [0, 1] — 0 for blocked/error-prone relays
```

Stats are populated automatically by the [`appPolicyRelayStats`](./apppolicies) default policy. `getQuality` returns `0` for non-relay URLs, relays in the user's [blocked list](./data#specialized-relay-lists), or error-prone relays, and higher scores for relays that are connected or have been seen before.

## Tags & relay hints

Domain writers build their own tags, including relay hints. A hint is a deferred `Hint` object occupying the relay-hint slot of a tag; `renderTags()` dereferences it to a single url through the resolver (unresolved views render it as `""`). The shared helpers on `EventWriter` are:

```typescript
const writer = app.use(Domain).writer(Note)

writer.tagPubkey(pubkey, petname?)     // ["p", pubkey, hint(outbox(pubkey)), petname]
writer.addQuote(event, relay?)         // ["q", id, relay ?? hint(outbox(pubkey)), pubkey]
writer.addZapSplit(pubkey, split?)     // ["zap", pubkey, hint(outbox(pubkey)), split]
```

Kind-specific tagging lives on the concrete writer — e.g. `NoteWriter.setParent(event)` does NIP-10 reply threading (p-tags the parent's participants, then e/a-tags the parent and thread root with markers and relay hints).

A typical reply, published through the domain:

```typescript
import {Note} from "@welshman/domain"

const writer = app.use(Domain)
  .writer(Note)
  .setContent("well said")
  .setParent(parentEvent)

// render + wrap in a Command, which carries the relays it resolved
const command = await app.use(Domain).command(writer)

await command.publish()
```

`app.use(Domain).command(writer)` requires a signed-in user, calls `writer.render()` (which renders the event and resolves its relays), and returns a `Command` you can `.publish()`. It replaces the old `Router.commandFromBuilder(builder)`.
