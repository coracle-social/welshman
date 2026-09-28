# Plugin Architecture

Every feature in `@welshman/app` is a **plugin**, a class constructed with a single `IApp` argument and resolved lazily through `app.use(...)`. The data plugins are built on a few base classes in `plugins/base.ts`, and most of their accessors return a `Projection`.

```typescript
const profiles = app.use(Profiles)   // new Profiles(app), memoized per app
```

## `Projection<T>`

A `Projection<T>` is a value that can be read synchronously or reactively.

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

The default `get` is `getter($)` from `@welshman/store`, which caches the store value on hot paths, so `.get()` is cheap to call repeatedly.

## Base classes

| Base class | Source of truth | Loads from network? | Used for |
|---|---|---|---|
| `MapPlugin<T>` | Its own `Map` | No | Local, non-event data (relay stats, plaintext) |
| `LoadableMapPlugin<T>` | Its own `Map` | Yes (HTTP) | Relay NIP-11 info, NIP-05 handles, zappers |
| `DerivedPlugin<T>` | The `repository` | Yes (events) | Data derived from nostr events (profiles, lists, …) |
| `RelayScopedDerivedPlugin<T>` | The `repository` and `tracker` | Yes (events) | Event data keyed per relay (NIP-29 rooms, relay roles) |

`DerivedPlugin` is the most common. It is a live view over the app's event repository, so cached events appear immediately and new ones stream in.

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

`set`, `delete` and `clear` notify `onItem` subscribers, which can persist the collection to storage.

### `LoadableMapPlugin<T>`

A `MapPlugin` that lazily fetches items. Subclasses implement `fetch`, and the base adds caching and backoff.

```typescript
abstract class LoadableMapPlugin<T> extends MapPlugin<T> {
  abstract fetch(key: string, ...args: any[]): Promise<unknown>

  load(key: string, ...args: any[]): Promise<Maybe<T>>        // cached + deduped + backoff
  forceLoad(key: string, ...args: any[]): Promise<Maybe<T>>   // bypass the cache
}
```

Subscribing to `one(key)` triggers a lazy `load`. Caching, in-flight de-duplication, and exponential backoff come from `makeLoadItem` in `@welshman/store` (default staleness window: one hour).

### `DerivedPlugin<T>`

A keyed collection derived from repository events. The repository is the only source of truth, and the plugin keeps no map of its own.

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

`index` comes from `@welshman/store`'s `deriveItemsByKey({filters, eventToItem, getKey, repository: app.repository})`. `eventToItem` may be async, for lists with encrypted entries.

### `RelayScopedDerivedPlugin<T>`

A `DerivedPlugin` whose `getKey(item, url)` runs once per relay the event was seen on (via the tracker), so the same addressable coordinate on two relays stays two entries. `getKey` returns `undefined` to exclude an item on a relay. `RelaySignedDerivedPlugin` (in `plugins/relays.ts`) narrows it to events signed by the relay's own NIP-11 `self` key, and backs `RelayRoles`, `RelayMemberLists` and `RoomPinLists`.

## Lifecycle of a `DerivedPlugin` read

1. **Read (cached):** `get(key)` (sync) or `one(key)` (reactive) returns whatever already matches in the repository.
2. **Lazy load:** subscribing to `one(key)` (or calling `load(key)`) triggers `fetch(key)`. Caching skips recently-loaded keys; in-flight calls for the same key collapse; failures back off exponentially.
3. **Decode:** inbound events flow through `eventToItem`. Async decoders resolve and update the index when ready.
4. **Derive:** convenience accessors (`display(...)`, `urls(...)`, …) are `project(key, read)` calls returning a `Projection<U>`.

`forceLoad` bypasses the cache and resolves to the freshly-read item.

## Repository-derived stores

A custom store derived straight from the repository uses the `@welshman/store` derivation functions with the app's `repository` (and `tracker` for relay-scoped views). The [`Events`](./requests#querying-the-repository-events) plugin wraps the common cases as projections. The derivation functions are:

- `deriveItemsByKey<T>({filters, eventToItem, getKey, repository})` — the live keyed collection `DerivedPlugin` builds on
- `deriveEvents(opts)` / `deriveEventsById(opts)` / `makeDeriveEvent(opts)` — derived event stores
- `deriveEventsByIdByUrl(opts)` / `deriveEventsByIdForUrl(opts)` — relay-scoped views (also take the `tracker`)
- `deriveIsDeleted(repository, event)` — reactive deletion status

## The `Domain` plugin

`app.use(Domain)` binds the app's dependencies to `@welshman/domain` kinds. Every kind in `@welshman/domain` is a **`KindFactory`**, a bundle of `reader`, `writer`, and `query` classes with no knowledge of any app. `Domain` hands each factory the app's resolver and signer, producing a `ConfiguredKind` that reads, builds, and queries events.

```typescript
class Domain {
  constructor(app: IApp)

  configure(factory: KindFactory): ConfiguredKind   // memoized per factory
  reader(factory: KindFactory): (event) => Parsed<Reader>
  writer(factory: KindFactory, reader?: Reader): Writer
  query(factory: KindFactory): Query
  command(writer: EventWriter): Promise<Command>
}
```

`configure` injects the `KindContext`:

```typescript
factory.configure({
  resolver: app.use(Router).resolver,
  get signer() { return app.user?.signer },
})
```

The `signer` is a getter because policies replace it (via `wrapSigner`) after configuration. The `resolver` is shared with the `Router` plugin and is stable for the app's lifetime.

### Reading — `reader(factory)`

`reader(factory)` returns an `(event) => Parsed<Reader>` function that builds the reader and runs `parse()`. Most kinds parse synchronously and return the reader directly. The private-tag lists and `AppData` decrypt with the app's signer and return a promise. Either way the function fits a `DerivedPlugin`'s `eventToItem`, and a collection of a synchronous kind has its items in place before the first `get()`:

```typescript
import {Note, MuteList} from "@welshman/domain"

// as a DerivedPlugin decoder:
eventToItem: app.use(Domain).reader(Note)

// ad hoc, no IO — no await:
const note = app.use(Domain).reader(Note)(event)
note.content()

// ad hoc, decrypts private tags — the type requires the await:
const mutes = await app.use(Domain).reader(MuteList)(event)
mutes.pubkeys()           // string[], public + private when decrypted
mutes.includes(pubkey)    // boolean
```

A reader exposes synchronous getters over the event (`id()`, `author()`, `content()`, `tags()`, `createdAt()`, `address()`, `room()`) plus per-kind accessors such as `FollowListReader.pubkeys()` and `RelayListReader.readUrls()`.

### Writing — `writer(factory, reader?)`

`writer(factory)` builds a fresh event writer. Passing an existing `reader` seeds an **edit** from that event's content and tags:

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

Every setter returns the writer, so setters chain. The shared setters, the per-kind setters, and the render methods are documented in [Readers & Writers](../domain/readers-and-writers#eventwriter). `render()` returns the unsigned template and its target relays as `{event, relays}`.

### Publishing — `command(writer)`

`command(writer)` requires a signed-in user, calls `writer.render()`, and wraps the result in a [`Command`](./publishing#commands):

```typescript
const command = await app.use(Domain).command(writer)
```

A writer's relays come from the `RelaySelection`s it routes to, resolved by the [`Router`](./routing#the-router)'s resolver.

## Writing your own plugin

A plugin is any class with the shape `new (app: IApp) => T`. A data collection extends one of the base classes, and a plugin that only adds behavior is a plain class:

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
const thing$ = things.one(pubkey)   // loads over the outbox model on subscribe
```
