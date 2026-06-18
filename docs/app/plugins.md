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

## Writing your own plugin

A plugin is any class with the shape `new (app: IApp) => T`. Extend one of the base classes for a data collection, or write a plain class for behavior:

```typescript
import {DerivedPlugin, Network, type IApp} from "@welshman/app"
import {SOME_KIND, readSomething} from "@welshman/util"

export class Somethings extends DerivedPlugin<ReturnType<typeof readSomething>> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [SOME_KIND]}],
      eventToItem: event => readSomething(event),
      getKey: item => item.event.pubkey,
    })
  }

  fetch = (pubkey: string, relayHints: string[] = []) =>
    this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [SOME_KIND]}, relayHints)
}

// usage
const things = app.use(Somethings)
const thing$ = things.one(pubkey)   // lazily loads via the outbox model
```
