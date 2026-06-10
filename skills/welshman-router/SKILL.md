---
name: welshman-router
description: "Use this skill when working with @welshman/router: relay selection, routing strategies, scenario-based relay routing, or choosing which relays to use for reads/writes."
---

# welshman/router — Relay Selection

`@welshman/router` provides scenario-based relay selection for nostr clients. It answers the question "which relays should I use for this operation?" by scoring candidate relays based on pubkey relay lists, relay quality, and configurable fallback policies. It sits between `@welshman/util` (types/helpers) and `@welshman/net` (actual relay connections), and is wrapped by `@welshman/app` for full-stack usage.

## Installation

```bash
npm install @welshman/router
# or
pnpm add @welshman/router
yarn add @welshman/router
```

Peer dependencies: `@welshman/lib`, `@welshman/net`, `@welshman/util`.

## Key Exports

### Router (class)

The main entry point. Use as a singleton via `Router.configure()` + `Router.get()`, or instantiate directly with options.

| Method | Description |
|--------|-------------|
| `Router.configure(options)` | Merge options into the global `routerContext` |
| `Router.get()` | Return a `Router` instance using the global context |
| `new Router(options)` | Create a router that overrides specific options from the global context |

**RouterOptions** (all optional):

| Option | Signature | Description |
|--------|-----------|-------------|
| `getUserPubkey` | `() => string \| undefined` | Current user's pubkey |
| `getPubkeyRelays` | `(pubkey, mode?) => string[]` | Relays for a pubkey; `mode` is `"read"`, `"write"`, or `"messaging"` |
| `getDefaultRelays` | `() => string[]` | Fallback relays of last resort |
| `getIndexerRelays` | `() => string[]` | Relays that index profiles and relay lists (NIP-65) |
| `getSearchRelays` | `() => string[]` | Relays supporting NIP-50 search |
| `getRelayQuality` | `(url) => number` | Quality score 0–1 for a relay (affects selection ranking) |
| `getLimit` | `() => number` | Max relays returned by `getUrls()` (default: 3) |

**Default behavior:** if `getPubkeyRelays` is not configured, the router falls back to querying the local `Repository` (from `@welshman/net`) for kind-10002 events.

### Router Scenario Methods

All return a `RouterScenario`. Naming convention: `For*` = relays to write to (so others can read), `From*` = relays to read from (author's outbox).

| Method | Description |
|--------|-------------|
| `FromRelays(relays)` | Use an explicit list of relay URLs |
| `ForUser()` | User's read relays (where others can send things to the user) |
| `FromUser()` | User's write relays (user's outbox) |
| `MessagesForUser()` | User's messaging relays (NIP-17 DMs) |
| `ForPubkey(pubkey)` | A pubkey's read relays |
| `FromPubkey(pubkey)` | A pubkey's write relays (outbox) |
| `MessagesForPubkey(pubkey)` | A pubkey's messaging relays |
| `ForPubkeys(pubkeys)` | Merged read relays for multiple pubkeys |
| `FromPubkeys(pubkeys)` | Merged write relays for multiple pubkeys |
| `MessagesForPubkeys(pubkeys)` | Merged messaging relays for multiple pubkeys |
| `Event(event)` | Event author's write relays (where the event lives) |
| `Replies(event)` | Event author's read relays (where replies should be sent) |
| `PublishEvent(event)` | Author's outbox + mentioned pubkeys' read relays; hard-limits to 30 |
| `Quote(event, id, hints)` | Best relays to find a quoted event; checks tag relay hints and author pubkey from tag |
| `EventParents(event)` | Relays for fetching parent events (from ancestor tags + mentioned pubkeys) |
| `EventRoots(event)` | Relays for fetching root events |
| `Search()` | Search relays |
| `Index()` | Indexer relays |
| `Default()` | Default/fallback relays |
| `merge(scenarios)` | Combine multiple scenarios into one |

### RouterScenario (class)

Immutable builder — every builder method returns a new instance. Terminal methods (`getUrls()`, `getUrl()`) return relay URLs, not instances.

| Method | Description |
|--------|-------------|
| `getUrls()` | Execute selection; returns `string[]` |
| `getUrl()` | Returns the first selected URL or `undefined` |
| `limit(n)` | Override max relay count for this scenario |
| `weight(scale)` | Multiply all selection weights by `scale` |
| `policy(fn)` | Set fallback policy |
| `allowLocal(bool)` | Allow `ws://localhost` / `ws://127.*` URLs (default: false) |
| `allowOnion(bool)` | Allow `.onion` URLs (default: false) |
| `allowInsecure(bool)` | Allow plain `ws://` non-onion URLs (default: false) |
| `filter(fn)` | Filter the internal `Selection[]` |
| `update(fn)` | Map over the internal `Selection[]` |

### Fallback Policies

Applied after relay scoring when not enough relays are found. Draw from `getDefaultRelays`.

| Export | Behavior |
|--------|----------|
| `addNoFallbacks` | Never add fallbacks (default) |
| `addMinimalFallbacks` | Add 1 fallback only if zero relays were selected |
| `addMaximalFallbacks` | Fill remaining slots up to the limit |

### Filter Selection

| Export | Description |
|--------|-------------|
| `getFilterSelections(filters, rules?)` | Returns `RelaysAndFilters[]` — optimized relay+filter combos for a subscription |
| `RelaysAndFilters` | `{ relays: string[], filters: Filter[] }` |
| `defaultFilterSelectionRules` | The default ordered rule array |
| `getFilterSelectionsForSearch` | Rule: search filters → search relays (weight 10) |
| `getFilterSelectionsForWraps` | Rule: kind-1059 wraps without authors → user messaging relays |
| `getFilterSelectionsForIndexedKinds` | Rule: kinds 0/3/10002/10050 → indexer relays |
| `getFilterSelectionsForAuthors` | Rule: author filters → each author's outbox (split into up to 30 chunks) |
| `getFilterSelectionsForUser` | Rule: low-weight (0.2) baseline that always fires for every filter → user's read relays. It is not conditional on other rules failing. |

### Other Exports

| Export | Description |
|--------|-------------|
| `INDEXED_KINDS` | `[PROFILE, RELAYS, MESSAGING_RELAYS, FOLLOWS]` — kinds routed to indexers |
| `makeSelection(relays, weight?)` | Create a `Selection` object; validates and normalizes URLs |
| `Selection` | `{ weight: number, relays: string[] }` |
| `FallbackPolicy` | `(count: number, limit: number) => number` |
| `routerContext` | The global mutable options object updated by `Router.configure()` |

## Common Patterns

### 1. Configure once at app startup

`Router.get()` is the primary entry point — it returns a `Router` instance using the global `routerContext`. Call `Router.configure()` once at startup to set options, or assign directly to `routerContext` for individual overrides.

```typescript
import {Router} from '@welshman/router'

Router.configure({
  getUserPubkey: () => myStore.userPubkey,
  getPubkeyRelays: (pubkey, mode) => myStore.getRelaysForPubkey(pubkey, mode),
  getDefaultRelays: () => ['wss://relay.example.com/', 'wss://relay2.example.com/'],
  getIndexerRelays: () => ['wss://indexer.example.com/', 'wss://indexer2.example.com/'],
  getSearchRelays: () => ['wss://search.example.com/', 'wss://search2.example.com/'],
  getRelayQuality: (url) => myStore.getRelayQuality(url),
  getLimit: () => 5,
})
```

When using `@welshman/app`, it pre-configures `Router` automatically. The two most common customization points when using `@welshman/app` are `getDefaultRelays` and `getIndexerRelays`, which you can assign directly on `routerContext`:

```typescript
import {routerContext} from '@welshman/router'

routerContext.getDefaultRelays = () => [
  'wss://relay.example.com/',
  'wss://relay2.example.com/',
]

routerContext.getIndexerRelays = () => [
  'wss://indexer.example.com/',
  'wss://indexer2.example.com/',
]
```

### 2. Fetch events from specific pubkeys

```typescript
import {Router} from '@welshman/router'

const relays = Router.get().FromPubkeys(['pubkey1', 'pubkey2']).getUrls()
// relays is string[] — pass to your subscription
```

### 3. Publish an event

```typescript
import {Router} from '@welshman/router'
import type {TrustedEvent} from '@welshman/util'

function getPublishRelays(event: TrustedEvent): string[] {
  return Router.get().PublishEvent(event).getUrls()
  // Automatically includes author's outbox + mentioned pubkeys' read relays
  // Hard-limited to 30 relays for deliverability
}
```

### 4. Find a quoted/referenced event with fallbacks

```typescript
import {Router, addMaximalFallbacks} from '@welshman/router'
import type {TrustedEvent} from '@welshman/util'

function getQuoteRelays(event: TrustedEvent, quotedId: string, hints: string[]) {
  return Router.get()
    .Quote(event, quotedId, hints)
    .policy(addMaximalFallbacks)
    .limit(8)
    .getUrls()
}
```

### 5. Common scenario cheat-sheet

```typescript
import {Router} from '@welshman/router'

const router = Router.get()

// Read relays for the current user (where others deliver events to you)
router.ForUser().getUrls()

// Write relays for the current user (your outbox)
router.FromUser().getUrls()

// Best relays to deliver an event to a pubkey (their inbox)
router.ForPubkey('pubkey').getUrls()

// Best relays to fetch events authored by a pubkey (their outbox)
router.FromPubkey('pubkey').getUrls()

// Indexer relays (profiles, relay lists)
router.Index().getUrls()

// Cap relay count for this scenario only
router.ForPubkey('pubkey').limit(3).getUrls()

// Merge multiple scenarios; relay URLs are deduplicated when getUrls() is called
router.merge([
  router.FromUser(),
  router.Index(),
]).getUrls()
```

### 6. Build subscriptions with getFilterSelections

```typescript
import {getFilterSelections} from '@welshman/router'
import type {Filter} from '@welshman/util'

const filters: Filter[] = [
  {kinds: [1], authors: ['pubkey1', 'pubkey2']},
  {kinds: [0], search: 'bitcoin'},
]

for (const {relays, filters} of getFilterSelections(filters)) {
  // Open one subscription per relay group
  myPool.subscribe(relays, filters)
}
```

### 7. Use a custom filter routing rule

```typescript
import {
  Router,
  getFilterSelections,
  defaultFilterSelectionRules,
  type RelaysAndFilters,
} from '@welshman/router'
import type {Filter} from '@welshman/util'

// Add a rule that sends kind-1 to a dedicated relay
const myRule = (filter: Filter) => {
  if (!filter.kinds?.includes(1)) return []
  return [{filter, scenario: Router.get().FromRelays(['wss://notes.example.com/'])}]
}

const selections = getFilterSelections(filters, [myRule, ...defaultFilterSelectionRules])
```

## Integration Notes

- **`@welshman/util`** — Router imports `TrustedEvent`, `Filter`, `RelayMode`, `PROFILE`, `RELAYS`, `MESSAGING_RELAYS`, `FOLLOWS`, `WRAP`, `normalizeRelayUrl`, and tag-parsing helpers. All relay URLs are normalized with `normalizeRelayUrl` and validated with `isRelayUrl` before use.
- **`@welshman/net`** — The default `getPubkeyRelays` implementation queries `Repository.get()` (the in-memory event store from `@welshman/net`) for kind-10002 events. Override it if you maintain relay lists elsewhere.
- **`@welshman/app`** — The app layer pre-configures `Router` using its own stores (relay lists, connection quality). If you use `@welshman/app`, call `Router.configure` only to override specific options; the app layer handles the rest.
- **`@welshman/lib`** — Used internally for utilities (`sortBy`, `shuffle`, `uniq`, etc.); no direct integration needed.

## Gotchas & Tips

- **Relay list events must be in the Repository for pubkey routing to work.** The default `getPubkeyRelays` implementation reads kind-10002 (NIP-65) relay list events from the global in-memory `Repository`. If those events haven't been loaded — either from a local cache at startup or fetched from the network — the Router has no relay list data for that pubkey and silently falls back to default/indexer relays. When using `@welshman/app`, relay lists are fetched automatically as part of profile loading (`loadRelayList`, `makeOutboxLoader`). Without `@welshman/app`, you must fetch and load them yourself before calling pubkey-based scenarios.

- **`For*` vs `From*`**: `ForPubkey` returns a pubkey's **read** relays (where you send things for that pubkey to receive); `FromPubkey` returns their **write** relays (their outbox, where their events live). Use `From*` to fetch events, `For*` to deliver events.

- **Default limit is 3.** Set `getLimit` in `Router.configure` or call `.limit(n)` on a scenario if you need more. `PublishEvent` unconditionally overrides to 30.

- **Scoring includes randomness.** `getUrls()` introduces `Math.random()` in the scoring formula so that lower-quality or less-popular relays get occasional selection. Results are not deterministic across calls.

- **`addNoFallbacks` is the default policy.** If no relays are found for a scenario (e.g. no relay list for a pubkey) and you haven't set a policy, `getUrls()` returns `[]`. Use `addMinimalFallbacks` or `addMaximalFallbacks` when you need a result even for unknown pubkeys.

- **Insecure `ws://` URLs are filtered by default.** Only onion addresses (`*.onion`) are exempt from the TLS requirement. Pass `.allowInsecure(true)` to a scenario if you need to support plain websocket relays (e.g. local dev).

- **`getFilterSelections` uses `addMinimalFallbacks`.** Each resulting relay group will have at least one relay *if* `getDefaultRelays` is configured and returns relays. If `getDefaultRelays` is not configured or returns an empty array, the group may still be empty.

- **`routerContext` is a shared mutable object.** `Router.configure()` mutates it in place with `Object.assign`. `new Router(options)` merges the supplied options *over* the global `routerContext` (via `mergeLeft`), so any options not provided in `options` still fall back to whatever is in `routerContext`. For true isolation (e.g. in tests), pass a complete options object or reset `routerContext` first.

- **`Quote` reads relay hints from event tags.** It looks for a tag whose second element (`t[1]`) matches the quoted event ID, then extracts a relay hint from `t[2]` and an author pubkey from `t[3]`. Standard NIP-21/NIP-10 tag format.
