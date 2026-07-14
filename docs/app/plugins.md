# Plugin Architecture

Every feature in `@welshman/app` is a **plugin** — a class constructed with a single `IApp` argument and resolved lazily via `app.use(...)`. All the data-bearing plugins are built on a small set of base classes defined in `plugins/base.ts`. Understanding these three bases and the `Projection` type is enough to read (and extend) the entire library.

```typescript
const profiles = app.use(Profiles)   // new Profiles(app), memoized per app
```

## `Projection<T>`

Almost every accessor in the library returns a `Projection<T>` — a value you can read either synchronously or reactively.

```typescript
type Projection<T> = {
  get: () => T          // synchronous "hot" snapshot
  $: Readable<T>        // a Svelte readable for subscriptions / $-syntax
}
```

```typescript
const display = app.use(Profiles).display(pubkey)

display.get()           // string, right now
display.$               // Readable<string>, for `$display` in a component
```

Helpers:

```typescript
// Wrap a Readable into a Projection (default getter is hot-path aware)
projection<T>($: Readable<T>, get?): Projection<T>

// Derive one Projection from another, preserving both access modes
projectFrom<S, U>(src: Projection<S>, read: ($: S) => U): Projection<U>
```

The default `get` is `getter($)` from `@welshman/store`, which automatically switches between `svelte.get` and a live subscription based on how often it is called — so `.get()` is safe in hot code paths.

## The three base classes

| Base class | Source of truth | Loads from network? | Used for |
|---|---|---|---|
| `MapPlugin<T>` | Its own `Map` | No | Local, non-event data (e.g. relay stats) |
| `LoadableMapPlugin<T>` | Its own `Map` | Yes (HTTP) | Data fetched over HTTP (relay NIP-11 info, NIP-05 handles, zappers) |
| `DerivedPlugin<T>` | The `repository` | Yes (events) | Anything derived from nostr events (profiles, lists, …) |

`DerivedPlugin` is the dominant pattern: it is a live view over the app's event repository, so cached events appear immediately and new ones stream in automatically.

### `MapPlugin<T>`

A reactive, keyed in-memory collection that owns its own `Map`.

```typescript
class MapPlugin<T> {
  index: Projection<ItemsByKey<T>>                       // the whole Map
  all: Projection<T[]>                                   // values
  one: (key?: string, ...args: any[]) => Readable<Maybe<T>>

  get(key: string): Maybe<T>                             // sync read
  project<U>(key: string, read: (item: Maybe<T>) => U): Projection<U>
  set(key: string, value: T): void
  delete(key: string): void
  clear(): void
  onItem(subscriber: (key: string, value: Maybe<T>) => void): Unsubscriber
}
```

`set`/`delete`/`clear` fire `onItem` subscribers — handy for persisting the collection to storage.

### `LoadableMapPlugin<T>`

A `MapPlugin` that lazily fetches items. Subclasses implement `fetch`; the base adds caching and backoff.

```typescript
abstract class LoadableMapPlugin<T> extends MapPlugin<T> {
  abstract fetch(key: string, ...args: any[]): Promise<unknown>

  load(key: string, ...args: any[]): Promise<Maybe<T>>        // cached + deduped + backoff
  forceLoad(key: string, ...args: any[]): Promise<Maybe<T>>   // bypass the cache
}
```

Subscribing to `one(key)` triggers a lazy `load`. Caching, in-flight de-duplication, and exponential backoff come from `makeLoadItem` in `@welshman/store` (default staleness window: one hour).

### `DerivedPlugin<T>`

A keyed collection derived from repository events. There is no duplicated map — the repository is the single source of truth.

```typescript
type DerivedPluginOptions<T> = {
  filters: Filter[]
  eventToItem: (event: TrustedEvent) => MaybeAsync<Maybe<T>>
  getKey: (item: T) => string
  loadOptions?: MakeLoadItemOptions
}

abstract class DerivedPlugin<T> {
  index: Projection<ItemsByKey<T>>
  all: Projection<T[]>
  one: (key?: string, ...args: any[]) => Readable<Maybe<T>>

  load(key: string, ...args: any[]): Promise<Maybe<T>>
  forceLoad(key: string, ...args: any[]): Promise<Maybe<T>>
  get(key: string): Maybe<T>
  project<U>(key: string, read: (item: Maybe<T>) => U): Projection<U>

  abstract fetch(key: string, ...args: any[]): Promise<unknown>
}
```

Internally it builds `index` from `app.use(Stores).itemsByKey({filters, eventToItem, getKey})`, a live readable derived over the repository. `eventToItem` may be async — useful when a list has encrypted entries that must be decrypted first.

## Lifecycle of a `DerivedPlugin` read

1. **Read (cached):** `get(key)` (sync) or `one(key)` (reactive) returns whatever already matches in the repository — instantly.
2. **Lazy load:** subscribing to `one(key)` (or calling `load(key)`) triggers `fetch(key)`. Caching skips recently-loaded keys; in-flight calls for the same key collapse; failures back off exponentially.
3. **Decode:** inbound events flow through `eventToItem`. Async decoders resolve and update the index when ready.
4. **Derive:** convenience accessors (`display(...)`, `urls(...)`, …) are `project(key, read)` calls returning a `Projection<U>`.

`forceLoad` bypasses the cache and resolves to the freshly-read item.

## The `Stores` plugin

`app.use(Stores)` is the repository/tracker-bound factory that `DerivedPlugin` builds on. It mostly forwards to `@welshman/store`, injecting the app's `repository` and `tracker`:

- `itemsByKey<T>(opts)` — the live keyed collection used by `DerivedPlugin`
- `events(opts)` / `eventsById(opts)` / `makeEvent(opts)` — derived event stores
- `eventsByIdByUrl(opts)` / `eventsByIdForUrl(opts)` — relay-scoped views (inject the tracker)
- `isDeleted(event)` — reactive deletion status

You rarely call `Stores` directly — the higher-level data plugins are usually what you want — but it is the seam to use when you need a custom repository-derived store wired to the app.

## The `Domain` plugin

`app.use(Domain)` binds the app's dependencies to `@welshman/domain` kinds. Every kind in `@welshman/domain` is a **`KindFactory`** — a bundle of a `reader`, a `writer`, and an optional `router` class — that has no knowledge of any particular app. `Domain` is the seam that hands each factory the app's resolver, repository, and signer, turning it into a `ConfiguredKind` you can actually read events with and build events from.

```typescript
class Domain {
  constructor(app: IApp)

  configure(factory: KindFactory): ConfiguredKind   // memoized per factory
  reader(factory: KindFactory): (event) => Promise<Reader>
  writer(factory: KindFactory, reader?: Reader): Writer
  command(writer: EventWriter): Promise<Command>
}
```

`configure` is memoized per factory and injects the `KindContext`:

```typescript
factory.configure({
  resolver: app.use(Router).resolver,   // dereferences routes -> relay urls
  repository: app.repository,           // lets routers find event parents
  get signer() { return app.user?.signer },   // lazy — auth policies can swap it
})
```

The `signer` is a **lazy getter** so app auth policies can replace it (via `wrapSigner`) after configuration; the `resolver` (shared with the `Router` plugin) and `repository` are stable for the app's lifetime.

### Reading — `reader(factory)`

`reader(factory)` returns the configured kind's async `reader` function: `(event) => Promise<Reader>`. It validates the event's kind and runs `parse()` (which, for encrypted lists, decrypts private tags using the app's signer). This is exactly the shape a `DerivedPlugin` wants for its `eventToItem` decoder:

```typescript
import {Note, FollowList} from "@welshman/domain"

// as a DerivedPlugin decoder:
eventToItem: app.use(Domain).reader(Note)

// or ad hoc:
const reader = await app.use(Domain).reader(FollowList)(event)
reader.pubkeys()          // string[]
reader.includes(pubkey)   // boolean
```

A reader exposes synchronous getters over the event — `id()`, `author()`, `content()`, `tags()`, `createdAt()`, `address()`, `group()` — plus per-kind accessors (`FollowListReader.pubkeys()`, `RelayListReader.readUrls()/writeUrls()`, `DeleteReader.ids()`, etc.).

### Writing — `writer(factory, reader?)`

`writer(factory)` builds a fresh event writer; pass an existing `reader` to seed an **edit** (the writer starts from that event's content and tags):

```typescript
import {FollowList, Note} from "@welshman/domain"

// edit an existing follow list:
const writer = app.use(Domain)
  .writer(FollowList, existingReader)
  .follow(pubkey)

// or compose a new note:
const note = app.use(Domain)
  .writer(Note)
  .setContent("hello")
  .setParent(parentEvent)   // NIP-10 reply threading
```

Writers are chainable (every setter returns `this`). Shared setters include `setContent`, `setGroup(url, group)`, `forceRelays(...urls)`, `setProtected`, `setExpiration`, `setIdentifier`, `addTags`, `keepTags`/`dropTags`; each kind adds its own (`FollowListWriter.follow/unfollow`, `DeleteWriter.addEvent/setReason`, `RelayListWriter.addReadUrl/addWriteUrl`, …).

A writer resolves to a template via `render(): Promise<EventTemplate>` and to its target relays via `relays(): Promise<string[]>`; `finalize()` returns both at once (`{event, relays}`). There is no `toEvent`/`toRumor` on the writer — the caller signs the rendered template.

### Publishing — `command(writer)`

`command(writer)` requires a signed-in user, finalizes the writer (rendering the template and resolving its relays), and wraps the result in a `Command` — an event paired with its target relays that hasn't committed to *how* it publishes:

```typescript
const command = await app.use(Domain).command(writer)

command.publish()                  // through the normal Thunks pipeline
command.publishToRelays(urls)      // a specific relay set
command.publishAsRelay(url)        // relay signs it (NIP-86 signevent), then publish back
```

This replaces the old `Router.commandFromBuilder(builder)`.

### Routing

A writer's target relays come from its `routes()` — a list of declarative `RelaySelection`s from `@welshman/util` (`userOutbox()`, `inboxes(pubkeys)`, `seen(event)`, `relays(urls)`, …) that the injected `resolver` scores into concrete urls. The default writer routes to the author's outbox plus every p-tagged pubkey's inbox; kinds override as needed (e.g. `FollowListWriter` routes to `[userOutbox()]` only, since its p-tags are data, not recipients). When a writer has `forcedRelays` (set via `setGroup`/`forceRelays`), it publishes **only** there. NIP-29 room ops and relay-management kinds set `requiresRelays`, so `render()`/`finalize()` throw unless explicit relays are supplied.

## The `Router` plugin

`app.use(Router)` is the app's relay router (it implements `FeedRouter` for `@welshman/feeds`). It owns the `Resolver` that `Domain` hands to every configured kind, so routing decisions are consistent across reads, writes, and feeds.

```typescript
class Router implements FeedRouter {
  resolver: Resolver

  resolve(selections: RelaySelection[]): Promise<RelayScenario>
  resolveRoute(route: RelayRoute): MaybeAsync<string[]>
}
```

- `resolver` is a `Resolver` (from `@welshman/util`) built with the app's `getRelayQuality` (from `RelayStats`) and `getDefaultRelays` (from `app.config`). This is the **same** resolver injected into every domain kind via `Domain.configure`.
- `resolve(selections)` scores a list of `RelaySelection`s into a `RelayScenario` (`= resolver.scenario(selections)`).
- `resolveRoute(route)` dereferences a single declarative route into urls:
  - `userInbox`/`userOutbox`/`userMessaging` → the required user's read/write/NIP-17 relays.
  - `pubkeyInbox`/`pubkeyOutbox`/`pubkeyMessaging` → that pubkey's relays (via `RelayLists` / `MessagingRelayLists`).
  - `eventInbox`/`eventOutbox` → resolve the referenced event's author, then its relays, merged with the ref's relay hints.
  - `seen` → the tracker's relays for the event id, plus the ref's relay hints.
  - `index` → `app.config.getIndexerRelays?.()`; `search` → `app.config.getSearchRelays?.()`; `relay` → `[route.url]`.

## Writing your own plugin

A plugin is any class with the shape `new (app: IApp) => T`. Extend one of the base classes for a data collection, or write a plain class for behavior:

```typescript
import {DerivedPlugin, Domain, Network, type IApp} from "@welshman/app"
import {Something, SomethingReader} from "@welshman/domain"
import {SOME_KIND} from "@welshman/util"

export class Somethings extends DerivedPlugin<SomethingReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [SOME_KIND]}],
      eventToItem: app.use(Domain).reader(Something),
      getKey: item => item.author(),
    })
  }

  fetch = (pubkey: string, relayHints: string[] = []) =>
    this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [SOME_KIND]}, relayHints)
}

// usage
const things = app.use(Somethings)
const thing$ = things.one(pubkey)   // lazily loads via the outbox model
```
