---
name: welshman-app
description: "Use this skill when working with @welshman/app: the instance-based client for building nostr applications — creating an App instance, the use() plugin registry, User & sessions, reactive data stores (profiles, follows, mutes, relay lists, handles, zappers), optimistic publishing with thunks, outbox-model requests, routing, web of trust, feeds, and search."
---

# welshman/app — Instance-Based Nostr App

## Overview

`@welshman/app` is the high-level app layer of welshman. It ties `util`, `net`, `store`, `router`, `signer`, and `feeds` together behind a single **`App`** instance. Everything — the event repository, connection pool, the signed-in user, and all features — hangs off that instance. There are **no module-level globals**: you create an app and reach everything through `app.use(...)`.

This is a redesign of the older global-singleton API. If you see code using `pubkey`, `deriveProfile`, `publishThunk`, `addSession`, or `Router.get()` as importable globals, that is the **old** API — it no longer exists. The current API is instance-based (see the migration table at the bottom).

## Installation

```bash
npm install @welshman/app
# or
pnpm add @welshman/app
yarn add @welshman/app
```

Peer deps: `svelte` (4 or 5), all `@welshman/*` workspace packages, and `@pomade/core`.

## Core mental model

1. **An app is an `App` instance.** It owns per-identity state (`repository`, `pool`, `tracker`, `wrapManager`), a `config`, and at most one `User`. Two apps never share data.
2. **Features are plugins**, resolved lazily and memoized via `app.use(SomeClass)`. Each plugin is constructed with the app and cached per app.
3. **`Projection<T>` is the universal accessor.** It has `.get()` (sync snapshot) and `.$` (Svelte `Readable`). Bind `.$` in components; call `.get()` in callbacks/hot paths.
4. **Reads are reactive and lazy-loading.** `app.use(Profiles).one(pubkey)` returns a store that fetches over the network (outbox model) and updates as events arrive.
5. **Writes are optimistic.** Publishing goes through *thunks*: the event hits the local repository immediately, signs lazily, and reports per-relay progress, with an abortable delay for soft-undo.

## Creating an app

```typescript
import {createApp} from "@welshman/app"

// Batteries-included: installs default policies (event ingestion, relay stats,
// gift-wrap unwrapping, NIP-42 auth-unless-blocked).
const app = createApp({
  user,                                    // optional User
  config: {
    dufflepudUrl: "https://dufflepud.example",   // optional: batches NIP-05/zapper lookups
    getDefaultRelays: () => [...],
    getIndexerRelays: () => [...],         // discovery relays for profiles/relay lists
    getSearchRelays: () => [...],          // NIP-50 search relays
  },
})

// Bare app with NO side effects (tests, or custom policies):
import {App} from "@welshman/app"
const bare = new App()

// Always tear down when discarding an app (e.g. switching identities):
app.cleanup()
```

`IApp` (what plugins/policies depend on): `{user?, config, use, netContext, pool, tracker, repository, wrapManager}`.

## User & sessions

A `User` is `{pubkey, signer}`. A `Session` is a serializable `{method, data}` descriptor you persist; session handlers turn it back into a signer.

```typescript
import {createApp, User, toSession, nip07} from "@welshman/app"
import {getNip07} from "@welshman/signer"

// Build a User from a live signer...
const user = await User.fromSigner(getNip07())

// ...or from a persisted session
const session = toSession(nip07, {})                  // serializable, store this
localStorage.setItem("session", JSON.stringify(session))
const restored = await User.fromSession(JSON.parse(localStorage.getItem("session")!))  // User | undefined

const app = createApp({user: restored})

// Gate user-only actions (throws if no user):
const u = User.require(app)
await u.sign(stampedEvent)
await u.nip44EncryptToSelf(payload)        // encrypt to self (private list entries)
```

Built-in session handlers (auto-registered): `nip01` `{secret}`, `nip07` `{}`, `nip46` `{clientSecret, signerPubkey, relays}`, `nip55` `{pubkey, signer}`, `pomade` `{clientOptions, email}`. Register custom ones with `defineSessionHandler` + `registerSessionHandler`.

## Data plugins (reactive collections)

All follow the same shape — `get(key)` (sync), `one(key)` (reactive, lazy-loads), `load(key)`/`forceLoad(key)` (promises), plus convenience accessors returning `Projection`. Resolve with `app.use(...)`.

| Plugin | Data | Notable accessors |
|---|---|---|
| `Profiles` | kind-0 profiles | `one(pk)`, `display(pk)`, `publish(values)` |
| `FollowLists` | kind-3 follows | `one(pk)`, `follow(tag)`, `unfollow(value)` |
| `MuteLists` | kind-10000 mutes (private = encrypted) | `mutePublicly(tag)`, `mutePrivately(tag)`, `unmute(v)`, `setMutes(...)` |
| `PinLists` | kind-10001 pins | `pin(tag)`, `unpin(value)` |
| `RelayLists` | NIP-65 (kind 10002) | `urls(pk)`, `readUrls(pk)`, `writeUrls(pk)`, `addRelay(url, mode)`, `setWriteRelays(urls)` |
| `BlockedRelayLists` | kind-10006 | `urls(pk)`, `addUrl`, `removeUrl`, `setUrls` |
| `MessagingRelayLists` | kind-10050 (NIP-17 DM relays) | `urls(pk)`, `addUrl`, ... |
| `SearchRelayLists` | kind-10007 | `urls(pk)`, `addUrl`, ... |
| `Relays` | NIP-11 relay info (HTTP) | `one(url)`, `display(url)`, `hasNip(url, n)`, `hasNegentropy(url)` |
| `RelayManagement` | NIP-86 | `post(url, request)` |
| `Handles` | NIP-05 (HTTP, batched) | `forPubkey(pk)`, `display(nip05)`, `loadForPubkey(pk)` |
| `Zappers` | LNURL zapper info (HTTP) | `forPubkey(pk)`, `validateZapReceipt(...)`, `validZapReceipts(...)` |
| `BlossomServerLists` | kind-10063 media servers | `one(pk)`, `load(pk)` |
| `Topics` | hashtags w/ counts | `all`, `byName` (plain `Readable`s) |
| `Rooms` | NIP-29 groups | `create/edit/delete/join/leave/addMember/removeMember(url, room, ...)` |
| `Plaintext` | decrypted-content cache (own events) | `ensure(event)`, `get(id)` |

```typescript
import {createApp, Profiles, RelayLists} from "@welshman/app"
const app = createApp({user})

// Reactive (Svelte): subscribe or use $ in a component
const profile$ = app.use(Profiles).one(pubkey)        // Readable<Maybe<Profile>>, lazy-loads
const name$    = app.use(Profiles).display(pubkey).$   // Readable<string>

// Synchronous snapshot (no load)
const profileNow = app.use(Profiles).get(pubkey)

// Explicit load
await app.use(Profiles).load(pubkey)

// Relay selections (outbox model)
const writeRelays = app.use(RelayLists).writeUrls(pubkey).get()  // string[]
await app.use(RelayLists).addRelay("wss://relay.example", RelayMode.Write)
```

## Publishing (optimistic thunks)

```typescript
import {Thunks} from "@welshman/app"
import {makeEvent, NOTE} from "@welshman/util"

// To the user's write relays (resolved via the Router):
const thunk = app.use(Thunks).publishToOutbox({
  event: makeEvent(NOTE, {content: "hi"}),
  delay: 3000,                  // abortable soft-undo window (ms)
})

// To specific relays:
app.use(Thunks).publish({event, relays: ["wss://relay.example"]})

// A thunk is a Svelte store with per-relay status:
thunk.subscribe(t => console.log(t.results))
thunk.abort()                                 // effective only before `delay` elapses
await thunk.waitForCompletion()
thunk.getError()                              // string | undefined
app.use(Thunks).history                       // writable<Thunk[]> — optimistic log
app.use(Thunks).retry(thunk)

// Gift-wrapped (NIP-59): single recipient via `recipient`, or many via Wraps:
app.use(Thunks).publish({event, relays, recipient: theirPubkey})
const merged = await app.use(Wraps).publish({event: rumor, recipients: [a, b]})

// Proof of work (NIP-13):
app.use(Thunks).publish({event, relays, pow: 20})
```

`ThunkOptions`: `{event, relays?, recipient?, delay?, pow?, ...PublishOptions}` (`app` is injected). Incoming wraps addressed to the user are auto-unwrapped by the default `appPolicyWraps`.

## Requests & sync

```typescript
import {Network, Sync} from "@welshman/app"
const net = app.use(Network)

const events = await net.load({filters: [{kinds: [1], authors: [pk]}], relays})
await net.request({filters, relays, autoClose: true})

// Outbox-model author load (resolves the author's write relays automatically):
const profileEvent = await net.loadUsingOutbox(pk, {kinds: [0]})

// Negentropy-aware reconciliation (falls back to request/publish when unsupported):
await app.use(Sync).pull({relays, filters: [{authors: [pk]}]})
await app.use(Sync).push({relays, filters: [{authors: [pk]}]})
```

## Routing & tags

```typescript
import {Router, Tags} from "@welshman/app"
import {addMinimalFallbacks} from "@welshman/router"

const router = app.use(Router)                // per-app; NOT Router.get()
const relays = router.FromUser().policy(addMinimalFallbacks).limit(8).getUrls()
const hint   = router.Event(event).getUrl()
// Scenes: FromUser(), FromPubkey(pk), FromRelays(urls), Event(e), EventRoots(e), Search()

const tags = app.use(Tags)
const replyTags = tags.tagEventForReply(parentEvent)   // also: tagPubkey, tagEvent,
                                                        // tagEventForComment/Quote/Reaction, tagZapSplit
app.use(Thunks).publishToOutbox({event: makeEvent(NOTE, {content: "ok", tags: replyTags})})
```

Relay quality used by the router comes from `app.use(RelayStats).getQuality(url)` (0–1; 0 for blocked/error-prone relays).

## Web of trust

```typescript
const wot = app.use(Wot)
wot.graph.get()                        // Map<pubkey, score>  (score = #roots following − #roots muting)
wot.max.get()                          // highest score
wot.follows(pk).get()                  // string[]
wot.network(pk).get()                  // follows-of-follows (minus direct follows)
wot.followers(pk).get()
wot.wotScore(myPk, theirPk).get()      // number (or .$  for reactive)
```

## Feeds & search

```typescript
import {makeIntersectionFeed, makeScopeFeed, makeKindFeed, Scope} from "@welshman/feeds"
import {get} from "svelte/store"

const controller = app.use(Feeds).makeFeedController({
  feed: makeIntersectionFeed(makeScopeFeed(Scope.Follows), makeKindFeed(1)),
  onEvent: event => {/* render */},
})
await controller.load(50)              // scopes (Self/Follows/Network/Followers) resolved via Wot

const search = get(app.use(Searches).profileSearch)
const pubkeys = search.searchValues("alice")   // also fires a NIP-50 network search; ranked by WoT
// also: app.use(Searches).topicSearch, relaySearch; createSearch(...) for custom indexes
```

## Plugin architecture (for extending)

Three base classes in `plugins/base.ts`:

- **`DerivedPlugin<T>`** — collection derived from repository events (the repo is the single source of truth). Pass `{filters, eventToItem, getKey}`; implement `fetch`. This is the dominant pattern.
- **`LoadableMapPlugin<T>`** — owns its own `Map`, lazily fetches over HTTP (e.g. `Relays`, `Handles`, `Zappers`). Implement `fetch`.
- **`MapPlugin<T>`** — owns its own `Map`, no network (e.g. `RelayStats`, `Plaintext`).

```typescript
import {DerivedPlugin, Network, type IApp} from "@welshman/app"
import {SOME_KIND, readSomething} from "@welshman/util"

export class Somethings extends DerivedPlugin<ReturnType<typeof readSomething>> {
  constructor(app: IApp) {
    super(app, {filters: [{kinds: [SOME_KIND]}], eventToItem: readSomething, getKey: i => i.event.pubkey})
  }
  fetch = (pk: string, hints: string[] = []) =>
    this.app.use(Network).loadUsingOutbox(pk, {kinds: [SOME_KIND]}, hints)
}

const things = app.use(Somethings)   // lazily constructed + memoized
```

Caching/backoff for `load` come from `makeLoadItem` (`@welshman/store`); default staleness window is 1 hour; `forceLoad` bypasses it.

## Policies & logging

Side effects live in `AppPolicy`s (`(app) => Unsubscriber`), run at construction, cleaned up by `cleanup()`.

- `defaultAppPolicies` = `[appPolicyIngest, appPolicyRelayStats, appPolicyWraps, appPolicyAuthUnlessBlocked]`.
- Auth builders: `makeAppPolicyAuth(shouldAuth)`, `appPolicyAuthAlways`, `appPolicyAuthNever`, `appPolicyAuthUnlessBlocked`.
- `makeAppPolicyLogger(onMessage)` forwards `LogMessage`s from the user's `LoggingSigner` (users created via `User.fromSigner`/`fromSession` are wrapped automatically).

```typescript
import {App, defaultAppPolicies, makeAppPolicyLogger} from "@welshman/app"
const app = new App({user, policies: [...defaultAppPolicies, makeAppPolicyLogger(console.log)]})
```

## Gotchas & tips

- **No globals.** Don't reach for importable `pubkey`/`deriveProfile`/`publishThunk`/`Router.get()` — they don't exist. Create an `App` and use `app.use(...)`.
- **`use()` is memoized per app.** `app.use(Profiles)` always returns the same instance for a given app. Cheap to call repeatedly.
- **`Projection` vs `Readable`.** Convenience accessors (`display`, `urls`, `wotScore`, …) return a `Projection` — use `.$` for the store, `.get()` for a snapshot. `one(key)` returns a plain `Readable` (and triggers a load on subscribe).
- **`get(key)` does not load; `one(key)`/`load(key)` do.** Use `get` for a pure cache read.
- **Most loads use the outbox model**, which needs the author's relay list. `loadUsingOutbox` (and therefore most `fetch` methods) first loads NIP-65 relays for the author.
- **`createApp` vs `new App`.** `createApp` installs default policies; `new App` installs none. In tests prefer `new App` (no background subscriptions) unless you need ingestion.
- **Call `cleanup()`** when discarding an app to close sockets and free the repository/tracker/wrap state.
- **The core class is `App`** (constructed by the `createApp` factory), the interface plugins depend on is `IApp`, and the config/options/policy types are `AppConfig`/`AppOptions`/`AppPolicy`.

## Old API → new API

| Old (global) | New (instance-based) |
|---|---|
| `addSession(...)` / `pubkey.get()` | `User.fromSession(...)` + `createApp({user})`; `app.user?.pubkey` |
| `deriveProfile(pk)` | `app.use(Profiles).one(pk)` |
| `deriveProfileDisplay(pk)` | `app.use(Profiles).display(pk).$` |
| `publishThunk({...})` | `app.use(Thunks).publish({...})` / `publishToOutbox({...})` |
| `follow(tag)` / `mute(tag)` | `app.use(FollowLists).follow(tag)` / `app.use(MuteLists).mutePublicly(tag)` |
| `load({...})` / `request({...})` | `app.use(Network).load({...})` / `request({...})` |
| `Router.get().FromUser()` | `app.use(Router).FromUser()` |
| `relays` / `handles` / `zappers` stores | `app.use(Relays)` / `Handles` / `Zappers` |

## Related skills

- `welshman-store` — the `Repository` and Svelte-store primitives this layer builds on.
- `welshman-router` — relay-selection strategies behind `app.use(Router)`.
- `welshman-net` — request/publish/sockets behind `app.use(Network)`.
- `welshman-signer` — signers and login methods used by `User`/sessions.
- `welshman-feeds` — feed construction used by `app.use(Feeds)`.
