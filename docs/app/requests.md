# Making Requests

The `Network` plugin (`app.use(Network)`) wraps the `@welshman/net` request/publish/negentropy functions, injecting the app's net context (its pool and repository) so you don't have to pass it every time. The `Sync` plugin (`app.use(Sync)`) builds on top for negentropy-aware reconciliation.

## Loading and requesting

```typescript
const net = app.use(Network)

// One-shot load — resolves with matching events
const events = await net.load({
  filters: [{kinds: [1], authors: [pubkey]}],
  relays: ["wss://relay.example"],
})

// Open a subscription
await net.request({
  filters: [{kinds: [1]}],
  relays: ["wss://relay.example"],
  autoClose: true,
})
```

`net.load` is a shared, batched loader (created with a 50ms delay / 3s timeout). Use `net.makeLoader(options)` if you need a loader with different batching characteristics.

```typescript
publish(options)        // publish an event (prefer the Thunks plugin for app publishing)
makeLoader(options)     // build a custom batched Loader
```

## The outbox model: `loadUsingOutbox`

`loadUsingOutbox` is the workhorse most data plugins use. Given an author's pubkey, it builds a route list (`[...relays(hints), outbox(pubkey)]` — any passed relay hints plus the author's NIP-65 **write** relays), resolves it through `app.use(Router).resolve(...)` into a `RelayScenario`, takes that scenario's `getUrls()`, loads from them via the shared batched loader, and resolves with the most recent matching event.

```typescript
const latestProfile = await net.loadUsingOutbox(pubkey, {kinds: [0]})

// With relay hints to try first
const note = await net.loadUsingOutbox(pubkey, {kinds: [1], limit: 1}, ["wss://hint.example"])
```

The filter is always constrained to `authors: [pubkey]`. This is the mechanism behind the lazy loading you get from `app.use(Profiles).one(pubkey)`, `FollowLists`, `MuteLists`, and friends.

`loadAllUsingOutbox(pubkey, filter?, hints?)` is the collection variant: same routing, but it returns every matching event instead of just the newest one.

## Negentropy sync

`Sync` reconciles the local repository with relays using NIP-77 (negentropy) where available, and falls back to plain request/publish where it isn't (detected via `app.use(Relays).hasNegentropy(url)`).

```typescript
type AppSyncOpts = {relays: string[]; filters: Filter[]}

const sync = app.use(Sync)

// Pull missing events from relays into the local repository
await sync.pull({relays, filters: [{kinds: [3], authors: [pubkey]}]})

// Push local events up to relays
await sync.push({relays, filters: [{authors: [pubkey]}]})

// Query the local repository (sorts unless any filter has a limit)
const local = sync.query([{kinds: [1]}])
```

`pull` and `push` operate per relay: if the relay supports negentropy they use efficient set-reconciliation (`net.pull`/`net.push`); otherwise they fall back to a normal request (pull) or publishing each event individually (push). Low-level negentropy primitives are also exposed directly on `Network`:

```typescript
net.diff(options)       // compute a NIP-77 set difference
net.pull(options)       // negentropy pull
net.push(options)       // negentropy push
```

## Querying the repository: `Events`

`app.use(Network)` fetches events; `app.use(Events)` reads the ones you already have. Every method
binds this app's repository and tracker and returns a `Projection` — snapshot with `.get()`,
subscribe with `.$` — so there's no separate get/derive pair to keep in sync.

```typescript
import {Events} from "@welshman/app"

const events = app.use(Events)

events.byId(filters).$          // Map<id, TrustedEvent>
events.all(filters).$           // repository order
events.asc(filters).$           // oldest first
events.desc(filters).$          // newest first
events.one(idOrAddress, hints)  // a single event, loaded on first read if missing
events.isDeleted(event).$
```

Scoped to a relay, via the tracker:

```typescript
events.byIdForUrl(url, filters).$
events.forUrl(url, filters).$
events.byIdByUrl(filters).$             // Map<url, Map<id, TrustedEvent>>
events.relaySignedForUrl(url, filters).$ // only events the relay itself signed
```

`relaySignedForUrl` is the loose counterpart to `RelaySignedDerivedPlugin`: relay-generated kinds
(NIP-29 room state, relay membership) mean nothing from another author, so anything whose pubkey
isn't the relay's NIP-11 `self` is dropped.
