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

The main entry point. Instantiate directly with options: `new Router(options)`. There is no singleton, no global context, and no `Router.configure()` / `Router.get()` — construct a `Router` once and pass it around (or let `@welshman/app` provide a preconfigured instance via `app.use(Router)`; see Integration Notes).

| Constructor | Description |
|-------------|-------------|
| `new Router(options)` | Create a router from a `RouterOptions` object (all fields optional) |

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

**Default behavior:** none of these options have built-in defaults. If `getPubkeyRelays` is not configured, `getRelaysForPubkey` simply returns `[]`, so pubkey-based scenarios produce no relays unless a fallback policy pulls in `getDefaultRelays`. The Router never reads relay lists from a `Repository` itself — supplying relay-list data is the caller's job (see Integration Notes).

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
| `Quote(event, value, relays?)` | Best relays to find a quoted event: the passed `relays`, plus the author's read *and* write relays, plus any relay hint (`t[2]`) and author pubkey (`t[3]`) found on the tag whose value (`t[1]`) equals `value` |
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
| `getFilterSelections(filters, router, rules?)` | Returns `RelaysAndFilters[]` — optimized relay+filter combos for a subscription. Each rule is `(filter, router) => FilterScenario[]` |
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

## Common Patterns

### 1. Create a router

Construct a `Router` with a `RouterOptions` object and hold onto the instance. All options are optional; supply the ones your app can answer.

```typescript
import {Router} from '@welshman/router'

const router = new Router({
  getUserPubkey: () => myStore.userPubkey,
  getPubkeyRelays: (pubkey, mode) => myStore.getRelaysForPubkey(pubkey, mode),
  getDefaultRelays: () => ['wss://relay.example.com/', 'wss://relay2.example.com/'],
  getIndexerRelays: () => ['wss://indexer.example.com/', 'wss://indexer2.example.com/'],
  getSearchRelays: () => ['wss://search.example.com/', 'wss://search2.example.com/'],
  getRelayQuality: (url) => myStore.getRelayQuality(url),
  getLimit: () => 5,
})
```

When using `@welshman/app`, you don't construct one yourself — the app exposes a preconfigured `Router` (wired to its relay-list and relay-stats stores) that you reach with `app.use(Router)`:

```typescript
import {Router} from '@welshman/app'

const router = app.use(Router)
```

The examples below assume a `router` instance obtained either way.

### 2. Fetch events from specific pubkeys

```typescript
const relays = router.FromPubkeys(['pubkey1', 'pubkey2']).getUrls()
// relays is string[] — pass to your subscription
```

### 3. Publish an event

```typescript
import type {TrustedEvent} from '@welshman/util'

function getPublishRelays(event: TrustedEvent): string[] {
  return router.PublishEvent(event).getUrls()
  // Automatically includes author's outbox + mentioned pubkeys' read relays
  // Hard-limited to 30 relays for deliverability
}
```

### 4. Find a quoted/referenced event with fallbacks

```typescript
import {addMaximalFallbacks} from '@welshman/router'
import type {TrustedEvent} from '@welshman/util'

// `quotedId` is matched against each tag's value (t[1]); `hints` are extra relays
function getQuoteRelays(event: TrustedEvent, quotedId: string, hints: string[]) {
  return router
    .Quote(event, quotedId, hints)
    .policy(addMaximalFallbacks)
    .limit(8)
    .getUrls()
}
```

### 5. Common scenario cheat-sheet

```typescript
// `router` is a Router instance (see pattern 1)

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

for (const selection of getFilterSelections(filters, router)) {
  // Open one subscription per relay group
  myPool.subscribe(selection.relays, selection.filters)
}
```

### 7. Use a custom filter routing rule

```typescript
import {
  Router,
  getFilterSelections,
  defaultFilterSelectionRules,
} from '@welshman/router'
import type {Filter} from '@welshman/util'

// Add a rule that sends kind-1 to a dedicated relay.
// Rules receive the router as their second argument.
const myRule = (filter: Filter, router: Router) => {
  if (!filter.kinds?.includes(1)) return []
  return [{filter, scenario: router.FromRelays(['wss://notes.example.com/'])}]
}

const selections = getFilterSelections(filters, router, [myRule, ...defaultFilterSelectionRules])
```

## Integration Notes

- **`@welshman/util`** — Router imports `TrustedEvent`, `Filter`, `RelayMode`, `PROFILE`, `RELAYS`, `MESSAGING_RELAYS`, `FOLLOWS`, `WRAP`, `normalizeRelayUrl`, and tag-parsing helpers. All relay URLs are normalized with `normalizeRelayUrl` and validated with `isRelayUrl` before use.
- **`@welshman/net`** — The Router itself never reads relay lists from a `Repository`; `getRelaysForPubkey` only calls the `getPubkeyRelays` you provide (returning `[]` when it isn't set). `@welshman/net` is a peer dependency because the router's output (relay URL lists) is what you feed into net's request/publish primitives — sourcing relay-list data is the caller's job.
- **`@welshman/app`** — The app layer provides a `Router` subclass (`packages/app/src/plugins/router.ts`) wired to its own stores: `getPubkeyRelays` reads from the `RelayLists` collection, `getRelayQuality` from `RelayStats`, and the user pubkey / default / indexer / search relay getters come from `app.config`. Reach it with `app.use(Router)`. There is no global context or `Router.configure()` — customize by configuring the app (e.g. `app.config.getDefaultRelays` / `getIndexerRelays`).
- **`@welshman/lib`** — Used internally for utilities (`sortBy`, `shuffle`, `uniq`, etc.); no direct integration needed.

## Gotchas & Tips

- **Pubkey routing only works if `getPubkeyRelays` can answer.** The Router does not read relay lists from any `Repository`; `getRelaysForPubkey` returns exactly `getPubkeyRelays?.(pubkey, mode) || []`. If your `getPubkeyRelays` has no data for a pubkey (e.g. its NIP-65 relay list hasn't been loaded yet), pubkey-based scenarios return `[]` unless a fallback policy pulls in `getDefaultRelays`. When using `@welshman/app`, `getPubkeyRelays` is backed by the `RelayLists` collection — but you still need those relay lists loaded (from cache at startup or fetched from the network) before pubkey-based scenarios have anything to route to.

- **`For*` vs `From*`**: `ForPubkey` returns a pubkey's **read** relays (where you send things for that pubkey to receive); `FromPubkey` returns their **write** relays (their outbox, where their events live). Use `From*` to fetch events, `For*` to deliver events.

- **Default limit is 3.** Set `getLimit` in the `RouterOptions` you pass to `new Router`, or call `.limit(n)` on a scenario if you need more. `PublishEvent` unconditionally overrides to 30.

- **Scoring includes randomness.** `getUrls()` introduces `Math.random()` in the scoring formula so that lower-quality or less-popular relays get occasional selection. Results are not deterministic across calls.

- **`addNoFallbacks` is the default policy.** If no relays are found for a scenario (e.g. no relay list for a pubkey) and you haven't set a policy, `getUrls()` returns `[]`. Use `addMinimalFallbacks` or `addMaximalFallbacks` when you need a result even for unknown pubkeys.

- **Insecure `ws://` URLs are filtered by default.** Only onion addresses (`*.onion`) are exempt from the TLS requirement. Pass `.allowInsecure(true)` to a scenario if you need to support plain websocket relays (e.g. local dev).

- **`getFilterSelections` uses `addMinimalFallbacks`.** Each resulting relay group will have at least one relay *if* `getDefaultRelays` is configured and returns relays. If `getDefaultRelays` is not configured or returns an empty array, the group may still be empty.

- **Each `Router` is self-contained.** A router uses exactly the `RouterOptions` passed to its constructor — there is no global context and no option merging. For isolation (e.g. in tests), just construct a fresh `new Router({...})` with the options you want.

- **`Quote` reads relay hints from event tags.** Called as `Quote(event, value, relays?)`, it looks for a tag whose value (`t[1]`) equals the `value` argument (typically the quoted event ID), then extracts a relay hint from `t[2]` and an author pubkey from `t[3]`. It always also includes the author's read and write relays plus any `relays` you pass. Standard NIP-21/NIP-10 tag format.
