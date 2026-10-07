# Making Requests

The `Network` plugin (`app.use(Network)`) wraps the `@welshman/net` request, publish and loader functions and binds them to the app's net context (its pool and repository). Cleaning up the app aborts its in-flight requests. The `Sync` plugin (`app.use(Sync)`) adds negentropy-aware reconciliation.

## Loading and requesting

```typescript
const net = app.use(Network)

// One-shot load — resolves with matching events
const events = await net.loadComplete({
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

`net.loadComplete` is a shared, batched loader with a 50ms delay and a 3s timeout. It resolves once every relay has closed or timed out, so an empty result means every relay answered nothing. The outbox model routes on that answer.

`net.loadLenient` is the same loader with a 0.5 threshold, resolving as soon as half the relays have closed. The rest stay open and their events still reach the repository. It suits calls where nothing routes on the returned array, such as a search whose matches are read reactively.

`net.makeLoader(options)` builds a loader with different batching, bound to the same context. `net.publish(options)` sends a signed event directly. App publishing goes through the [`Publisher`](./publishing), which adds the optimistic write and status tracking.

## The outbox model: `loadUsingOutbox`

Most data plugins load through `loadUsingOutbox`. Given an author's pubkey, it resolves `[...relays(hints), outbox(pubkey)]` (the relay hints plus the author's NIP-65 **write** relays) through the [Router](./routing), loads from the resulting urls with `loadComplete`, and returns the most recent matching event.

```typescript
const latestProfile = await net.loadUsingOutbox(pubkey, {kinds: [0]})

// With relay hints to try first
const note = await net.loadUsingOutbox(pubkey, {kinds: [1], limit: 1}, ["wss://hint.example"])
```

The filter is always constrained to `authors: [pubkey]`. Lazy loading in `Profiles`, `FollowLists`, `MuteLists` and the other outbox-backed plugins goes through it.

`loadAllUsingOutbox(pubkey, filter?, hints?)` routes the same way and returns every matching event instead of the newest one.

## Negentropy sync

`Sync` reconciles the local repository with relays one relay at a time. A relay whose NIP-11 document advertises negentropy (`app.use(Relays).hasNegentropy(url)`) gets NIP-77 set reconciliation through `@welshman/net`'s `pull` and `push`. Any other relay gets a plain request (pull) or one publish per event (push).

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

## Querying the repository: `Events`

`app.use(Network)` fetches events, and `app.use(Events)` reads the ones already in the repository. Every
method binds this app's repository and tracker and returns a [`Projection`](../store/projection#projection-t).

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

`relaySignedForUrl` drops any event whose pubkey isn't the relay's NIP-11 `self`, as
[`RelaySignedDerivedPlugin`](./plugins#relayscopedderivedplugin-t) does. Relay-generated kinds (NIP-29 room state, relay
membership) mean nothing from another author.
