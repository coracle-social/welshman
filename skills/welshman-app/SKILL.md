---
name: welshman-app
description: "Use this skill when working with @welshman/app: high-level Svelte stores for nostr apps, session management, WoT (web of trust), making requests, publishing events, user data, or relay selection at the app layer."
---

# welshman/app — Application Layer Stores

`@welshman/app` is the top-level application framework in the welshman stack. It wires together `@welshman/net` (subscriptions/publishing), `@welshman/store` (reactive collections), `@welshman/router` (relay selection), and `@welshman/signer` (key management) into ready-to-use Svelte stores and high-level utilities. It powers production apps like Coracle and Flotilla.

## Installation

```bash
npm install @welshman/app
# or
pnpm add @welshman/app
yarn add @welshman/app
```

## Key Exports

### Core Singletons

| Export | Description |
|---|---|
| `repository` | Singleton `Repository` from `@welshman/net`; non-DVM, non-ephemeral events received from the pool are stored here. WRAP (NIP-59) events are handled separately via `unwrapAndStore` and require `shouldUnwrap` to be set to `true` to process. |
| `tracker` | Singleton `Tracker`; maps event IDs to the relays they were seen on |

### Session Management

| Export | Description |
|---|---|
| `pubkey` | `Writable<string \| undefined>` — active session's pubkey |
| `session` | `Readable<Session \| undefined>` — derived from `pubkey` + `sessions` |
| `sessions` | `Writable<Record<string, Session>>` — all loaded sessions |
| `signer` | `Readable<ISigner \| undefined>` — signer for the active session |
| `signerLog` | `WritableWithGetter<SignerLogEntry[]>` — writable store that the session layer appends signer-operation entries to (useful for UI feedback during remote signing) |
| `SessionMethod` | Enum: `Nip01`, `Nip07`, `Nip46`, `Nip55`, `Pomade`, `Pubkey`, `Anonymous` |

**Login functions** (all call `addSession` internally):

```typescript
loginWithNip01(secret: string): void
loginWithNip07(pubkey: string): void
loginWithNip46(pubkey, clientSecret, signerPubkey, relays): void
loginWithNip55(pubkey: string, signerPackageName: string): void
loginWithPomade(pubkey, email, clientOptions): void
loginWithPubkey(pubkey: string): void   // read-only
```

**Session utilities**:

```typescript
addSession(session: Session): void        // add and activate
dropSession(pubkey: string): void         // remove and clean up signer
getSession(pubkey: string): Session | undefined
updateSession(pubkey, fn): void
clearSessions(): void
nip46Perms: string                        // default NIP-46 permission string
```

**Gift wrap (NIP-59)**:

```typescript
shouldUnwrap: Writable<boolean>           // must be true to process incoming wraps
wrapManager: WrapManager                  // tracks wrap↔rumor mappings
unwrapAndStore(wrap: SignedEvent): Promise<void>
```

### Publishing — Thunks

| Export | Description |
|---|---|
| `publishThunk(options: ThunkOptions): Thunk` | Create, enqueue, and optimistically publish an event |
| `Thunk` | Class representing a single in-flight publish |
| `MergedThunk` | Aggregates multiple `Thunk`s (used by `sendWrapped`) |
| `thunks` | `Writable<Thunk[]>` — all active thunks |
| `abortThunk(thunk)` | Abort all constituent thunks |
| `retryThunk(thunk)` | Re-publish with original options |
| `mergeThunks(thunks[])` | Combine into a `MergedThunk` |

**Thunk status helpers**:

```typescript
thunkIsComplete(thunk): boolean
getThunkError(thunk): string | undefined
getThunkUrlsWithStatus(statuses, thunk): string[]
getCompleteThunkUrls(thunk): string[]
getFailedThunkUrls(thunk): string[]
waitForThunkError(thunk): Promise<string>
waitForThunkCompletion(thunk): Promise<void>
```

`ThunkOptions`:
```typescript
type ThunkOptions = {
  event: EventTemplate   // unsigned — will be signed lazily
  relays: string[]
  recipient?: string     // if set, event is NIP-59 gift-wrapped
  delay?: number         // ms to wait before sending (abort window)
  pow?: number           // proof-of-work difficulty target
  timeout?: number       // ms per relay before marking as timed out
  // PublishOptions callbacks: onSuccess, onFailure, onPending, onTimeout, onAborted, onComplete
}
```

### Commands (Higher-level Thunk Factories)

Most return a `Thunk` (or `Promise<Thunk>`). They automatically load the relevant user list before modifying it. Exception: `manageRelay` returns `Promise<Response>` (an HTTP response from the NIP-86 management endpoint), not a Thunk.

| Export | Description |
|---|---|
| `setProfile(profile: Profile)` | Publish NIP-01 profile metadata |
| `follow(tag: string[])` | Add to NIP-02 follow list |
| `unfollow(value: string)` | Remove from follow list |
| `mutePublicly(tag)` | Add to public mute list |
| `mutePrivately(tag)` | Add to private (encrypted) mute list |
| `unmute(value)` | Remove from mute list |
| `setMutes({publicTags?, privateTags?})` | Replace entire mute list |
| `pin(tag)` / `unpin(value)` | Manage pin list |
| `addRelay(url, mode)` / `removeRelay(url, mode)` | NIP-65 relay list management |
| `setRelays(tags)` / `setReadRelays(urls)` / `setWriteRelays(urls)` | Bulk relay list updates |
| `addMessagingRelay(url)` / `removeMessagingRelay(url)` | NIP-17 messaging relay list |
| `addBlockedRelay(url)` / `removeBlockedRelay(url)` | Blocked relay list |
| `addSearchRelay(url)` / `removeSearchRelay(url)` | Search relay list |
| `sendWrapped({event, recipients, ...options})` | NIP-59 gift-wrap to multiple recipients |
| `manageRelay(url, request)` | NIP-86 relay management |
| `createRoom` / `editRoom` / `deleteRoom` / `joinRoom` / `leaveRoom` | NIP-29 group room management |

### Profiles

```typescript
profilesByPubkey: Readable<Map<string, Profile>>
profiles: Readable<Profile[]>
getProfile(pubkey: string): Profile | undefined
loadProfile(pubkey, relayHints?): Promise<void>
forceLoadProfile(pubkey, relayHints?): Promise<void>
deriveProfile(pubkey: string): Readable<Profile | undefined>  // auto-loads
deriveProfileDisplay(pubkey: string): Readable<string>         // display name with fallback
displayProfileByPubkey(pubkey: string): string                 // synchronous
```

### Follow / Mute / Pin Lists

Each list type follows the same pattern (`follow` shown, `mute` and `pin` are identical):

```typescript
followListsByPubkey: Readable<Map<string, List>>
followLists: Readable<List[]>
getFollowList(pubkey): List | undefined
loadFollowList(pubkey, relayHints?): Promise<void>
forceLoadFollowList(pubkey, relayHints?): Promise<void>
deriveFollowList(pubkey): Readable<List | undefined>
```

### Relay Lists

```typescript
// NIP-65 relay lists
relayListsByPubkey / relayLists / getRelayList / loadRelayList / deriveRelayList

// NIP-17 messaging relay lists
messagingRelayListsByPubkey / messagingRelayLists / getMessagingRelayList / loadMessagingRelayList / deriveMessagingRelayList

// Blocked relay lists
blockedRelayListsByPubkey / getBlockedRelayList / loadBlockedRelayList / deriveBlockedRelayList

// Search relay lists (internal only — not exported from @welshman/app)
// Use userSearchRelayList / loadUserSearchRelayList / forceLoadUserSearchRelayList from user.ts instead
```

### Outbox Loading

`makeOutboxLoader` creates a loader function for any event kind. It looks up the target pubkey's relay list (fetching it if needed), then fetches events from their write relays using the outbox model. This is the internal mechanism used by all built-in `loadX` helpers.

```typescript
import {makeOutboxLoader} from '@welshman/app'

// Signature: makeOutboxLoader(kind, filter?, limit?)
// Returns: (pubkey: string, relayHints?: string[]) => Promise<void>
// Results are stored in repository — read via the derived store/getter, not the return value.

// Loader for kind 1 notes (default limit = 1)
const loadNote = makeOutboxLoader(1)
await loadNote('target-pubkey')

// With extra filter constraints
const loadRecentNotes = makeOutboxLoader(1, {since: Math.floor(Date.now() / 1000) - 86400})
await loadRecentNotes('target-pubkey')

// Override the limit via the third positional argument (not inside the filter object)
const loadMany = makeOutboxLoader(1, {}, 20)
await loadMany('target-pubkey')

// With relay hints to seed the lookup
await loadNote('target-pubkey', ['wss://relay.damus.io/'])
```

**Relay URL helpers** (exported from index):

```typescript
getPubkeyRelays(pubkey: string, mode?: RelayMode): string[]
derivePubkeyRelays(pubkey: string, mode?: RelayMode): Readable<string[]>
```

### User Data Stores (current session)

These automatically derive from the active `pubkey` and trigger a load on first access:

```typescript
userProfile: Readable<Profile | undefined>
userFollowList: Readable<List | undefined>
userMuteList: Readable<List | undefined>
userPinList: Readable<List | undefined>
userRelayList: Readable<List | undefined>
userMessagingRelayList: Readable<List | undefined>
userSearchRelayList: Readable<List | undefined>
userBlockedRelayList: Readable<List | undefined>
userBlossomServerList: Readable<List | undefined>
```

Corresponding loaders (operate on the current session's pubkey):

```typescript
loadUserProfile(relays?)
forceLoadUserProfile(relays?)
loadUserFollowList / forceLoadUserFollowList
loadUserMuteList / forceLoadUserMuteList
loadUserPinList / forceLoadUserPinList
loadUserRelayList / forceLoadUserRelayList
loadUserMessagingRelayList / forceLoadUserMessagingRelayList
// ...etc for each list type
```

### Router

```typescript
import {Router, routerContext, addMaximalFallbacks, addMinimalFallbacks} from '@welshman/router'

// The index.ts wires up routerContext automatically:
// routerContext.getUserPubkey, getPubkeyRelays, getRelayQuality, getDefaultRelays, etc.

Router.get()                        // singleton with app-wired context
Router.get().FromUser()             // relays to publish from the current user
Router.get().ForPubkey(pubkey)      // relays to read a pubkey's events
Router.get().Event(event)           // best relay for a specific event
Router.get().Index()                // indexer/bootstrap relays
Router.get().FromRelays(urls)       // relay set from explicit URLs
  .policy(addMaximalFallbacks)      // add fallback relays
  .limit(8)
  .getUrls()                        // string[]
  .getUrl()                         // string | undefined (first)
```

`routerContext` settings (configure before using router):

```typescript
import {routerContext} from '@welshman/router'  // from @welshman/router, not @welshman/app

routerContext.getDefaultRelays = () => ["wss://relay.damus.io/", "wss://nos.lol/"]
```

### Tag Utilities

```typescript
tagPubkey(pubkey: string): string[]          // ["p", pubkey, relayHint, displayName]
tagEvent(event, url?, mark?): string[][]     // e-tag (+ a-tag if replaceable)
tagEventPubkeys(event): string[][]           // p-tags for all mentioned pubkeys (excl. self)
tagEventForQuote(event, relay?): string[]    // q-tag
tagEventForReply(event, relay?): string[][]  // full reply thread tags
tagEventForComment(event, relay?): string[][]// NIP-22 comment tags
tagEventForReaction(event, relay?): string[][]// reaction tags
tagZapSplit(pubkey, split?): string[]        // zap tag
```

### Web of Trust (WoT)

```typescript
// Reactive stores
followersByPubkey: Readable<Map<string, Set<string>>>
mutersByPubkey: Readable<Map<string, Set<string>>>
wotGraph: Writable<Map<string, number>>  // pubkey → score; rebuilt on follow/mute changes
maxWot: Readable<number>

// Synchronous getters
getFollows(pubkey): string[]
getMutes(pubkey): string[]
getFollowers(pubkey): string[]
getMuters(pubkey): string[]
getNetwork(pubkey): string[]             // follows-of-follows (excludes direct follows)
getFollowsWhoFollow(pubkey, target): string[]
getFollowsWhoMute(pubkey, target): string[]
getWotScore(pubkey, target): number      // follows-who-follow minus follows-who-mute

// Per-user reactive score
getUserWotScore(tpk: string): number
deriveUserWotScore(tpk: string): Readable<number>
```

### Handles & Zappers

```typescript
handlesByNip05: Writable<Map<string, Handle>>
deriveHandle(nip05: string): Readable<Handle | undefined>   // auto-loads
loadHandle(nip05): Promise<void>

zappersByLnurl: Writable<Map<string, Zapper>>
deriveZapper(lnurl: string): Readable<Zapper | undefined>   // auto-loads
loadZapper(lnurl): Promise<void>
```

### Feeds

```typescript
import {makeFeedController} from '@welshman/app'
import {makeKindFeed} from '@welshman/feeds'

// makeFeedController wraps FeedController with app-level scope/WoT helpers
const ctrl = makeFeedController({
  feed: makeKindFeed(NOTE),
  useWindowing: true,
  signal: abortController.signal,
  onEvent: (e) => { /* handle event */ },
  onExhausted: () => { /* no more events */ },
})

ctrl.load(100)
abortController.abort()
```

WoT-scoped feed helpers (passed automatically to `FeedController`):

```typescript
getPubkeysForScope(scope: string): string[]   // Scope.Self|Follows|Network|Followers
getPubkeysForWOTRange(min: number, max: number): string[]  // fractional of maxWot
```

### Sync (Negentropy)

```typescript
import {pull, push, hasNegentropy} from '@welshman/app'

// pull/push use negentropy if the relay supports it, falling back to plain requests
await pull({relays, filters})
await push({relays, filters})
hasNegentropy(url: string): boolean
```

### Application Context

```typescript
import {appContext} from '@welshman/app'

appContext.dufflepudUrl = 'https://my-dufflepud.example.com'
```

[Dufflepud](https://github.com/coracle-social/dufflepud) is an optional proxy server for NIP-05 lookups, zapper resolution, relay metadata, and link previews. Not required but helps bypass CORS.

---

## Common Patterns

### Login and publish a note

```typescript
import {makeSecret} from '@welshman/util'
import {loginWithNip07, publishThunk, signer} from '@welshman/app'
import {Router} from '@welshman/router'
import {NOTE, makeEvent} from '@welshman/util'
import {Nip07Signer} from '@welshman/signer'

// NIP-07 login
const nip07 = new Nip07Signer()
const pubkey = await nip07.getPubkey()
loginWithNip07(pubkey)

// Publish with optimistic local update and 3s undo window
const thunk = publishThunk({
  event: makeEvent(NOTE, {content: 'Hello Nostr!'}),
  relays: Router.get().FromUser().getUrls(),
  delay: 3000,
})

// Subscribe to per-relay status
thunk.subscribe($thunk => {
  for (const [url, result] of Object.entries($thunk.results)) {
    console.log(url, result.status, result.detail)
  }
})

// Soft-undo within delay window
setTimeout(() => thunk.controller.abort(), 1000)

// Wait for all relays to finish (thunk.complete is a Deferred<void>)
await thunk.complete
```

### Derive a reactive profile

```typescript
import {deriveProfile, deriveProfileDisplay} from '@welshman/app'

const targetPubkey = '97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322'

// Reactive store — loads the profile in the background on first subscribe
const profile = deriveProfile(targetPubkey)

// Reactive display name with npub fallback
const name = deriveProfileDisplay(targetPubkey)

// In Svelte
// $: displayName = $name
```

### Reply to an event

```typescript
import {publishThunk, tagEventForReply, tagPubkey, signer} from '@welshman/app'
import {Router} from '@welshman/router'
import {NOTE, makeEvent} from '@welshman/util'
import type {TrustedEvent} from '@welshman/util'

async function replyTo(parent: TrustedEvent, content: string) {
  const tags = tagEventForReply(parent)

  return publishThunk({
    event: makeEvent(NOTE, {content, tags}),
    relays: Router.get().PublishEvent(parent).getUrls(),
  })
}
```

### Send a NIP-59 gift-wrapped DM

```typescript
import {sendWrapped} from '@welshman/app'
import {DIRECT_MESSAGE, makeEvent} from '@welshman/util'

const mergedThunk = await sendWrapped({
  event: makeEvent(DIRECT_MESSAGE, {content: 'secret message'}),
  recipients: [recipientPubkey],
})

// Monitor combined status
mergedThunk.subscribe($t => {
  for (const [url, result] of Object.entries($t.results)) {
    console.log(url, result.status)
  }
})
```

### Follow/unfollow

```typescript
import {follow, unfollow} from '@welshman/app'

// tag format: ["p", pubkey] or ["p", pubkey, relayHint, petname]
await follow(["p", "97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322"])
await unfollow("97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322")
```

### Web of Trust filtering

```typescript
import {deriveUserWotScore, getWotScore, wotGraph, maxWot} from '@welshman/app'
import {get} from 'svelte/store'

// Filter a list of pubkeys to those with positive WoT score
const $graph = get(wotGraph)
const trusted = pubkeys.filter(pk => ($graph.get(pk) ?? 0) > 0)

// Reactive score for a single user
const score = deriveUserWotScore(somePubkey)

// Normalize by max score (0–1 range)
const $max = get(maxWot)
const normalized = ($graph.get(somePubkey) ?? 0) / ($max || 1)
```

### Load a feed of notes

```typescript
import {makeFeedController, getPubkeysForScope} from '@welshman/app'
import {makeKindFeed} from '@welshman/feeds'
import {NOTE} from '@welshman/util'

const abort = new AbortController()

const ctrl = makeFeedController({
  feed: makeKindFeed(NOTE),
  useWindowing: true,
  signal: abort.signal,
  onEvent: event => console.log(event),
  onExhausted: () => console.log('no more events'),
})

ctrl.load(50)

// cleanup
abort.abort()
```

---

## Integration Notes

- `@welshman/app` **re-exports nothing** from `@welshman/net`, `@welshman/router`, etc. Import those directly when you need low-level primitives (`load`, `request`, `publish`, `Router` scenarios beyond `FromUser`).
- The `index.ts` bootstrap code runs on import and automatically wires `routerContext` (pubkey relays, relay quality, default/indexer/search relays) and hooks `Pool` to store incoming events in `repository`. **Import `@welshman/app` early in your app entry point** so this runs before any requests. The canonical side-effect import pattern is:

  ```typescript
  // app entry point — must be first, before any @welshman/net or @welshman/router imports
  import "@welshman/app"

  // Then optionally override defaults
  import {routerContext} from "@welshman/router"
  routerContext.getDefaultRelays = () => ["wss://relay.damus.io/", "wss://nos.lol/"]
  ```
- `repository` and `tracker` are singletons shared across the whole app. All subscriptions made through `@welshman/net` that pass through the pool will populate `repository` automatically.
- `Router` is imported from `@welshman/router` but `routerContext` is configured by `@welshman/app/index.ts`. Use `Router.get()` (not `new Router(...)`) to get the app-configured singleton.
- `deriveProfile`, `deriveFollowList`, etc. use `makeLoadItem` under the hood: they fire a network request on first subscribe if data is not already in the repository, then resolve immediately on subsequent subscribes.
- `userFollowList`, `userMuteList`, etc. are derived from `pubkey`. They automatically re-derive when the active session changes (multi-account support).

---

## Using Welshman Stores Outside Svelte

All welshman stores implement the Svelte store contract: a `subscribe(callback) → unsubscribe` method where the callback fires **synchronously** with the current value on first call, then again on every change. This makes them trivially adaptable to any reactive framework — no Svelte runtime required, only the type imports.

### React

```typescript
import {useState, useEffect} from 'react'
import type {Readable, Writable} from 'svelte/store'

// Returns the current store value; re-renders when it changes.
function useReadable<T>(store: Readable<T>): T {
  const [value, setValue] = useState<T>(() => {
    // subscribe fires synchronously — capture the initial value then unsub immediately
    let initial!: T
    store.subscribe(v => { initial = v })()
    return initial
  })
  useEffect(() => store.subscribe(setValue), [store])
  return value
}

// Returns [currentValue, setter] — setter calls store.set directly.
function useWritable<T>(store: Writable<T>): [T, (value: T) => void] {
  return [useReadable(store), store.set]
}
```

Usage:

```tsx
import {userProfile, pubkey} from '@welshman/app'

function ProfileHeader() {
  const profile = useReadable(userProfile)
  const [currentPubkey, setPubkey] = useWritable(pubkey)

  return <div>{profile?.name ?? currentPubkey}</div>
}
```

### SolidJS

```typescript
import {createSignal, onCleanup} from 'solid-js'
import type {Readable, Writable} from 'svelte/store'

// Returns a SolidJS accessor (getter function); updates reactively.
function useReadable<T>(store: Readable<T>): () => T {
  let initial!: T
  store.subscribe(v => { initial = v })()   // sync capture then unsubscribe

  const [value, setValue] = createSignal<T>(initial)
  onCleanup(store.subscribe(v => setValue(() => v)))
  return value
}

// Returns [accessor, setter].
function useWritable<T>(store: Writable<T>): [() => T, (value: T) => void] {
  return [useReadable(store), store.set]
}
```

Usage:

```tsx
import {userProfile} from '@welshman/app'

function ProfileHeader() {
  const profile = useReadable(userProfile)
  return <div>{profile()?.name}</div>
}
```

### Vue

```typescript
import {ref, onUnmounted} from 'vue'
import type {Readable, Writable} from 'svelte/store'

function useReadable<T>(store: Readable<T>) {
  let initial!: T
  store.subscribe(v => { initial = v })()

  const value = ref<T>(initial)
  const unsub = store.subscribe(v => { value.value = v as any })
  onUnmounted(unsub)
  return value  // use as a readonly ref
}
```

### Notes

- **No Svelte runtime needed.** Only `svelte/store` types are imported. The store objects themselves ship with `@welshman/app`.
- **Welshman stores with `.get()`** (created via `withGetter`) can be read synchronously without subscribing — useful in event handlers and callbacks outside any reactive context. Most writable stores in `@welshman/app` expose `.get()`.
- **`subscribe` always fires immediately.** Unlike many observable libraries, the initial emission is synchronous, so the `useState` / `createSignal` initial value is always populated on first render.

---

## Gotchas & Tips

- **Thunks sign lazily.** `publishThunk` returns synchronously and immediately writes an unsigned/hashed event to `repository` for optimistic UI. Actual signing happens in a background queue. Do not assume the event has an `id` suitable for embedding in other events until signing completes.
- **`delay` is an undo window, not a debounce.** The thunk starts the delay timer immediately; if not aborted before `delay` ms, it signs and publishes. Calling `thunk.controller.abort()` after the delay has elapsed does nothing.
- **`sendWrapped` uses `recipients`, not `pubkeys`.** The docs example uses `pubkeys` but the actual type is `recipients: string[]`.
- **Gift wrap processing requires opt-in.** Set `shouldUnwrap.set(true)` to enable automatic NIP-59 unwrapping of incoming `kind:1059` events. Without this, wrapped events are silently discarded.
- **`commands` force-load lists before modifying them.** `follow()`, `unfollow()`, etc. call `forceLoadUserFollowList` to ensure they have the latest list before adding/removing, preventing accidental list truncation. Do not call these in rapid succession without awaiting each one.
- **WoT graph is rebuilt at most once per second** (throttled). Do not expect `wotGraph` to reflect a `follow()` call immediately; subscribe to the store instead.
- **`routerContext.getDefaultRelays` is throttled** with a 200 ms window by default in `index.ts`. It returns up to the 5 highest-quality known relays. Override it before any relay connections if you want a fixed bootstrap list.
- **Multiple sessions are supported.** Call `loginWith*` multiple times to add sessions. Switch the active session with `pubkey.set(otherPubkey)`. Remove a session with `dropSession(pubkey)` — this also cleans up the cached signer.
- **Stores have `.get()` via `withGetter`.** `pubkey.get()`, `signer.get()`, `session.get()`, `signerLog.get()`, `shouldUnwrap.get()` all work without `get()` from `svelte/store`. Use this for synchronous reads outside of reactive contexts.
- **`appContext.dufflepudUrl` must be set before first handle/zapper load.** There is no lazy re-fetch; set it at app startup.
