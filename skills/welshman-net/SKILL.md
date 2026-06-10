---
name: welshman-net
description: "Use this skill when working with @welshman/net: relay connections, request/publish flows, auth, relay pool management, adapters, policies, or low-level nostr network I/O."
---

# welshman/net — Relay Network Layer

`@welshman/net` is the core networking layer for welshman-based nostr apps. It manages WebSocket relay connections, subscriptions, event publishing, NIP-42 auth, and NIP-77 negentropy sync. It sits below `@welshman/app` (which provides higher-level reactive stores and routing) and depends on `@welshman/util` for event types and `@welshman/lib` for utilities.

## Installation

```bash
npm install @welshman/net
# or
pnpm add @welshman/net
yarn add @welshman/net
```

## Key Exports

### Pool & Sockets

| Export | Description |
|--------|-------------|
| `Pool` | Singleton connection pool; creates and manages `Socket` instances per relay URL |
| `Pool.get()` | Returns the singleton `Pool` instance |
| `pool.get(url)` | Gets or lazily creates a `Socket` for the given relay URL |
| `pool.remove(url)` | Removes and cleans up a socket |
| `pool.subscribe(cb)` | Fires `cb(socket)` each time a new socket is created; returns unsubscriber |
| `Socket` | WebSocket wrapper with status tracking, send queue, and auth state |
| `SocketStatus` | Enum: `Open`, `Opening`, `Closing`, `Closed`, `Error` |
| `SocketEvent` | Enum: `Status`, `Send`, `Sending`, `Receive`, `Receiving`, `Error` |
| `socket.auth` | `AuthState` instance for NIP-42 on this connection |

### Request

| Export | Description |
|--------|-------------|
| `requestOne(options)` | Subscribe to a single relay; returns `Promise<TrustedEvent[]>` |
| `request(options)` | Subscribe to multiple relays in parallel; returns `Promise<TrustedEvent[]>` |
| `makeLoader(options)` | Creates a batching `load` function with configurable delay/timeout/threshold |
| `load(options)` | Pre-built loader: 200 ms batch delay, 3 s timeout, 0.5 threshold. Simpler than `request()` when you just want events — auto-closes after EOSE, timeout, or disconnect; resolves when half the relays' subscriptions have closed; returns a `Promise<TrustedEvent[]>`. When used with `@welshman/app`, received events auto-flow into the repository and tracker. |

`request` / `requestOne` options (key fields):
- `relay` / `relays` — relay URL(s)
- `filters` — array of nostr `Filter` objects
- `autoClose?: boolean` — close subscription after EOSE or on socket disconnect
- `signal?: AbortSignal` — cancellation
- `tracker?: Tracker` — cross-relay deduplication (shared automatically by `request`)
- Callbacks: `onEvent(event, url)`, `onEose(url)`, `onClose()`, `onDisconnect(url)`, `onFiltered`, `onDuplicate`, `onDeleted`, `onInvalid`, `onClosed(reason, url)`

`request`-only options:
- `threshold?: number` — fraction of relays that must close before the promise resolves (default `1`)

Without `autoClose` or a `signal`, `requestOne` streams indefinitely — the returned promise only resolves if the relay sends CLOSED for all active subscription IDs. Default policies also re-send the REQ when sockets reconnect.

### Publish

| Export | Description |
|--------|-------------|
| `publish(options)` | Publishes to multiple relays; resolves to `PublishResultsByRelay` |
| `publishOne(options)` | Publishes to a single relay; resolves to `PublishResult` |
| `PublishStatus` | Enum: `Sending`, `Pending`, `Success`, `Failure`, `Timeout`, `Aborted` |
| `PublishResult` | `{ relay: string, status: PublishStatus, detail: string }` |
| `PublishResultsByRelay` | `Record<string, PublishResult>` |

`publish` options: `event`, `relays`, `timeout?` (default 10 s), `signal?`, `context?`, plus callbacks `onSuccess`, `onFailure`, `onPending`, `onTimeout`, `onAborted`, `onComplete`.

### Auth (NIP-42)

| Export | Description |
|--------|-------------|
| `AuthState` | Manages auth state for one socket; available as `socket.auth` |
| `AuthStatus` | Enum: `None`, `Requested`, `PendingSignature`, `DeniedSignature`, `PendingResponse`, `Forbidden`, `Ok` |
| `AuthStateEvent.Status` | Emitted when auth status changes |
| `makeSocketPolicyAuth(options)` | Creates a socket policy that auto-handles auth challenges |
| `defaultSocketPolicies` | Mutable array of policies applied to every new socket |

### Policies

| Export | Description |
|--------|-------------|
| `socketPolicyPing` | Sends a PING frame every 30 s when the socket is open and idle, to keep the connection alive |
| `socketPolicyAuthBuffer` | Buffers outgoing messages during auth and replays after success |
| `socketPolicyConnectOnSend` | Auto-opens closed sockets when a message is queued |
| `socketPolicyCloseInactive` | Closes idle sockets after 30 s (when no pending work remains); if the socket closes with pending work it delays and reopens, replaying queued messages |
| `defaultSocketPolicies` | Array of the four above; passed to every socket created by `Pool` |

A `SocketPolicy` is `(socket: Socket) => Unsubscriber`.

### Repository

| Export | Description |
|--------|-------------|
| `Repository` | In-memory indexed event store with delete/expiry support |
| `Repository.get()` | Returns the singleton instance |
| `repository.publish(event)` | Stores an event; returns `false` if duplicate/stale |
| `repository.query(filters, opts?)` | Returns matching `TrustedEvent[]` sorted by `created_at` desc |
| `repository.getEvent(idOrAddress)` | Look up by id or NIP-01 address (`kind:pubkey:d`) |
| `repository.isDeleted(event)` | `true` if a kind-5 delete covers this event |
| `repository.dump()` | Returns all stored events as `TrustedEvent[]` |
| `repository.load(events)` | Bulk-replaces all stored events; emits a single `"update"` diff. Events with `event[verifiedSymbol] = true` skip signature re-verification. |
| `LOCAL_RELAY_URL` | `"local://welshman.relay/"` — conventional URL for the local repository |
| `RepositoryUpdate` | `{ added: TrustedEvent[], removed: Set<string> }` — payload of `"update"` events |
| `mergeRepositoryUpdates(updates)` | Merges an array of `RepositoryUpdate` objects into one |

Emits `"update"` with `RepositoryUpdate` (`{ added: TrustedEvent[], removed: Set<string> }`) on every change.

> **Prefer `LOCAL_RELAY_URL` over direct repository access.** Rather than calling `repository.query()` or `repository.publish()` directly, pass `LOCAL_RELAY_URL` as a relay URL to the standard `load()`, `request()`, and `publish()` functions. This keeps local reads/writes going through the same policy, deduplication, and tracking pipeline as remote relay operations. Direct repository access is appropriate only for bulk startup (`repository.load()`) and low-level introspection (`repository.getEvent()`, `repository.isDeleted()`).

### Tracker

| Export | Description |
|--------|-------------|
| `Tracker` | Bidirectional map of `eventId ↔ Set<relayUrl>` |
| `tracker.track(eventId, relay)` | Records relay; returns `true` if the event was already seen |
| `tracker.getRelays(eventId)` | Set of relay URLs that have sent this event |
| `tracker.getIds(relay)` | Set of event ids seen from a relay |
| `tracker.copy(id1, id2)` | Copies relay associations from one id to another (used for gift wraps) |
| `tracker.load(relaysById)` | Bulk-replaces all relay mappings from a `Map<string, Set<string>>`; emits `"load"` |
| `tracker.clear()` | Removes all relay mappings; emits `"clear"` |

### Adapters

| Export | Description |
|--------|-------------|
| `getAdapter(url, context?)` | Factory: returns `SocketAdapter`, `LocalAdapter`, or custom adapter |
| `SocketAdapter` | WebSocket relay adapter |
| `LocalAdapter` | In-memory relay adapter |
| `MockAdapter` | Test adapter with manual send control |
| `AbstractAdapter` | Base class for custom adapters |
| `AdapterEvent.Receive` | Emitted when a relay message arrives |

### Context

| Export | Description |
|--------|-------------|
| `netContext` | Global `NetContext` config object |
| `NetContext` | `{ pool, repository, isEventValid, isEventDeleted, getAdapter? }` |

Mutate `netContext` fields directly to change global defaults; pass `context` to individual calls to override per-request.

### Negentropy / Diff (NIP-77)

| Export | Description |
|--------|-------------|
| `diff(options)` | Compares local events against relays; returns `{ relay, have, need }[]` |
| `pull(options)` | Fetches events relays have that you don't |
| `push(options)` | Publishes events you have that relays don't |
| `Difference` | Low-level per-relay negentropy session |

### Messages

| Export | Description |
|--------|-------------|
| `RelayMessageType` | Enum of relay→client message types |
| `ClientMessageType` | Enum of client→relay message types |
| `isRelayEvent()`, `isRelayEose()`, `isRelayOk()`, `isRelayAuth()`, etc. | Type guards for relay messages |
| `isClientReq()`, `isClientEvent()`, etc. | Type guards for client messages |

### WrapManager

| Export | Description |
|--------|-------------|
| `WrapManager` | Tracks NIP-59 gift wrap → rumor relationships; stores decrypted rumors in the repository and copies relay tracking from the wrap to the rumor |

---

## Common Patterns

### Connect to a relay and stream events

```typescript
import {Pool, SocketEvent, SocketStatus} from '@welshman/net'

const pool = Pool.get()
const socket = pool.get('wss://relay.example.com')

socket.on(SocketEvent.Status, (status: SocketStatus) => {
  console.log('status:', status)
})

// Send REQ directly (prefer request() for higher-level use)
socket.send(['REQ', 'my-sub', {kinds: [1], limit: 10}])
```

### Load events (one-shot, batched)

```typescript
import {load} from '@welshman/net'

// load() batches multiple concurrent calls within 200 ms into a single REQ per relay.
// It auto-closes after EOSE, timeout, or disconnect, and resolves at 50 % relay threshold.
const events = await load({
  relays: ['wss://relay.example.com', 'wss://relay2.example.com'],
  filters: [{kinds: [0], authors: ['<pubkey>']}],
})
```

### Stream events indefinitely

```typescript
import {request} from '@welshman/net'
import {now} from '@welshman/lib'

// Without autoClose this will stream forever.
// The returned promise never settles unless all relays close the subscription.
const ctrl = new AbortController()

request({
  relays: ['wss://relay.example.com'],
  filters: [{kinds: [1], since: now()}],
  signal: ctrl.signal,
  onEvent: (event, url) => console.log(event.id, 'from', url),
})

// Later:
ctrl.abort()
```

### Publish an event

```typescript
import {publish, PublishStatus} from '@welshman/net'

const results = await publish({
  event: signedEvent,
  relays: ['wss://relay.example.com', 'wss://relay2.example.com'],
  timeout: 5000,
  onSuccess: r => console.log('accepted by', r.relay),
  onFailure: r => console.warn('rejected by', r.relay, r.detail),
})

for (const [relay, result] of Object.entries(results)) {
  if (result.status === PublishStatus.Success) {
    console.log(relay, 'ok')
  }
}
```

### Enable NIP-42 auth globally

```typescript
import {defaultSocketPolicies, makeSocketPolicyAuth} from '@welshman/net'
import type {StampedEvent} from '@welshman/util'

// Call once at app startup, before any sockets are opened.
defaultSocketPolicies.push(
  makeSocketPolicyAuth({
    sign: (event: StampedEvent) => mySigner.sign(event),
    shouldAuth: (socket) => true, // auth on every relay
  }),
)
```

### Custom socket policies

A `SocketPolicy` is `(socket: Socket) => Unsubscriber`. It receives the socket when it is created, attaches listeners or patches socket methods, and returns a cleanup function. Push custom policies onto `defaultSocketPolicies` before any sockets are opened.

```typescript
import {writable} from 'svelte/store'
import {on} from '@welshman/lib'
import {defaultSocketPolicies, SocketEvent, isRelayEvent} from '@welshman/net'
import type {Socket, RelayMessage} from '@welshman/net'

// Track how many events each relay has delivered this session
export const eventCountByRelay = writable<Record<string, number>>({})

const eventCountPolicy = (socket: Socket) => {
  const unsub = on(socket, SocketEvent.Receive, (message: RelayMessage) => {
    if (isRelayEvent(message)) {
      eventCountByRelay.update(counts => ({
        ...counts,
        [socket.url]: (counts[socket.url] ?? 0) + 1,
      }))
    }
  })

  return unsub  // called when the socket is destroyed
}

defaultSocketPolicies.push(eventCountPolicy)
```

The same structure applies to more advanced patterns — patch `socket.open` to block connections, listen to `SocketEvent.Sending`/`SocketEvent.Receiving` to intercept messages before they are processed, or manipulate `socket._recvQueue` directly to suppress or replay messages.

### Custom adapter (e.g. non-WebSocket backend)

```typescript
import {AbstractAdapter, AdapterEvent, request} from '@welshman/net'
import type {ClientMessage} from '@welshman/net'

class MyAdapter extends AbstractAdapter {
  constructor(private url: string) {
    super()
    // set up your transport here
  }

  get urls() { return [this.url] }
  get sockets() { return [] }

  send(message: ClientMessage) {
    // forward message to your backend; call this.emit(AdapterEvent.Receive, replyMsg, this.url) when data arrives
  }
}

request({
  relays: ['myscheme://some-id'],
  filters: [{kinds: [1]}],
  autoClose: true,
  context: {
    getAdapter: (url) => url.startsWith('myscheme://') ? new MyAdapter(url) : undefined,
  },
})
```

### Use LOCAL_RELAY_URL to read/write the local repository

Pass `LOCAL_RELAY_URL` as a relay to the standard net functions so local operations go through the same pipeline as remote ones (policies, deduplication, tracker):

```typescript
import {load, publish, request, LOCAL_RELAY_URL} from '@welshman/net'
import {now} from '@welshman/lib'

// Read from the local repository the same way you'd read from a remote relay
const events = await load({
  relays: [LOCAL_RELAY_URL],
  filters: [{kinds: [1], authors: ['<pubkey>'], limit: 20}],
})

// Write to the local repository (and any remote relays) in one call
await publish({
  event: signedEvent,
  relays: [LOCAL_RELAY_URL, 'wss://relay.example.com'],
})

// Subscribe to new local events in real time
request({
  relays: [LOCAL_RELAY_URL],
  filters: [{kinds: [1], since: now()}],
  onEvent: (event) => console.log('new local event', event.id),
})
```

Direct `repository` API calls (`repository.load()`, `repository.getEvent()`, `repository.isDeleted()`, `repository.dump()`) are still appropriate for bulk startup and low-level introspection — but for routine reads and writes prefer `LOCAL_RELAY_URL`.

### Startup: bulk-load persisted events (skip re-verification)

```typescript
import {Repository} from '@welshman/net'
import {verifiedSymbol} from '@welshman/util'
import type {TrustedEvent} from '@welshman/util'

const repo = Repository.get()

// Mark events as already-verified so welshman skips signature checks
const storedEvents: TrustedEvent[] = await loadFromStorage()
for (const event of storedEvents) {
  event[verifiedSymbol] = true
}

// Replaces all in-memory events in one pass; emits a single "update"
repo.load(storedEvents)
```

### Startup: bulk-load Tracker state

```typescript
import {tracker} from '@welshman/app'   // singleton wired to the pool and repository

// Build the map from your stored relay<->event mappings
const relaysById = new Map<string, Set<string>>()
for (const {id, relays} of storedTrackerItems) {
  if (repo.getEvent(id)) {           // skip orphaned entries
    relaysById.set(id, new Set(relays))
  }
}

// Takes Map<string, Set<string>> — same shape as tracker.relaysById
tracker.load(relaysById)
```

### Persist repository changes to IndexedDB (canonical pattern)

```typescript
import {on, batch} from '@welshman/lib'
import {repository} from '@welshman/app'   // singleton; or Repository.get() standalone
import type {RepositoryUpdate} from '@welshman/net'
import type {TrustedEvent} from '@welshman/util'

// batch(ms, fn) collects all "update" events fired within `ms` and calls fn once
on(
  repository,
  'update',
  batch(3000, async (updates: RepositoryUpdate[]) => {
    const toAdd: TrustedEvent[] = []
    const toRemove = new Set<string>()

    for (const {added, removed} of updates) {
      for (const event of added) toAdd.push(event)
      for (const id of removed) toRemove.add(id)
    }

    const tx = db.transaction('events', 'readwrite')
    await Promise.all([
      ...toAdd.map(e => tx.store.put(e)),
      ...Array.from(toRemove).map(id => tx.store.delete(id)),
      tx.done,
    ])
  }),
)
```

---

## Integration Notes

- **`@welshman/util`** — provides `TrustedEvent`, `SignedEvent`, `Filter`, `verifyEvent`, `matchFilters`, `getAddress`, etc. All event objects flowing through `@welshman/net` are `TrustedEvent` (already verified).
- **`@welshman/lib`** — utility helpers (`Emitter`, `batcher`, `defer`, `on`, etc.) used internally; `Emitter` (from `@welshman/lib`) is the base class for `Tracker`, `Repository`, and `WrapManager`. `Socket`, `AuthState`, `AbstractAdapter`, and `Difference` extend node's built-in `EventEmitter` directly.
- **`@welshman/app`** — wraps `@welshman/net` with reactive Svelte stores, a router, and higher-level helpers. Most app-level code should use `@welshman/app`; drop down to `@welshman/net` only for raw relay I/O or when building non-Svelte clients.
- **`netContext`** — shared singleton used as the default by `request`, `requestOne`, and the repository. Override fields on `netContext` at startup, or pass a `context` object per-call to isolate behavior.

---

## Gotchas & Tips

- **Use `LOCAL_RELAY_URL`, not direct repository calls, for routine reads/writes.** Passing `LOCAL_RELAY_URL` to `load()`, `publish()`, or `request()` routes through the normal net pipeline (policies, deduplication, tracker). Calling `repository.query()` / `repository.publish()` directly bypasses all of that. Reserve the direct API for bulk startup (`repository.load()`), introspection (`getEvent`, `isDeleted`, `dump`), and listening to `"update"` events.

- **`request()` without `autoClose` or `signal` never resolves.** Always pass `autoClose: true` or an `AbortSignal` when you just want a one-shot fetch. Use `load()` for the common case.
- **`load()` sets `autoClose: true` internally** and uses a 0.5 relay threshold; it resolves when half the relays' subscriptions have closed (typically after EOSE, timeout, or disconnect) — useful when some relays are slow or offline.
- **Relay URL normalization** happens inside `Pool.get(url)` via `normalizeRelayUrl`. Pass raw URLs everywhere; the pool handles canonicalization.
- **`defaultSocketPolicies` is mutable.** Push policies before any sockets are created. Sockets created before a policy is pushed will not have it applied.
- **`socketPolicyCloseInactive` only replays pending work on unexpected close.** It reopens and replays queued messages when a socket closes while work is pending — it does not proactively open sockets when new work is queued (that is `socketPolicyConnectOnSend`'s job). After `pool.remove(url)` the socket is cleaned up including its policy listeners, so `socketPolicyCloseInactive` can no longer reopen it.
- **`Pool.get(url)` lazily creates a new socket on every call after `pool.remove(url)`.** Calling `pool.remove(url)` forgets the URL and cleans up the socket — any subsequent `pool.get(url)` will construct a fresh socket. Call `pool.remove()` only when you want the pool to forget the URL entirely, not merely to disconnect temporarily.
- **`Tracker` is shared across relays in `request()`.** This means `onDuplicate` fires for events received from more than one relay — expected behavior for cross-relay deduplication.
- **`Repository.publish()` returns `false` for stale replaceable events.** If a newer version of a replaceable event is already stored, the older one is silently dropped.
- **`WrapManager` stores the decrypted rumor in the `Repository`** and copies relay tracking from the gift-wrap event id to the rumor id. Keep a reference to the `WrapManager` instance alongside your `Repository` and `Tracker` singletons.
- **`makeSocketPolicyAuth` requires a `sign` function** that returns a `Promise<SignedEvent>`. If the user cancels signing, have the `sign` function throw or reject; `doAuth` will catch the failure via `tryCatch` and automatically transition to `AuthStatus.DeniedSignature`, preventing infinite retry loops.
- **Each filter in `filters` array generates a separate REQ** inside `requestOne`. For large filter arrays consider merging them with `unionFilters` from `@welshman/util` before calling `request`.
- **`repository.load()` replaces all events, not appends.** It clears internal indexes first, then re-inserts every event. Emit a single batched `"update"` diff — do not call it repeatedly for incremental updates; use `repository.publish(event)` for that.
- **`RepositoryUpdate.removed` is `Set<string>`, not an array.** Iterate with `for...of` or `Array.from(removed)`. The `batch()` helper from `@welshman/lib` delivers updates as `RepositoryUpdate[]` to your flush callback — merge them yourself or use `mergeRepositoryUpdates`.
- **`tracker.load()` takes `Map<string, Set<string>>`** (the same type as `tracker.relaysById`). Load it after `repository.load()` so you can filter out orphaned event ids.
