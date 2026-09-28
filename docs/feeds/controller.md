# Feed Controller

`FeedController` loads a feed page by page and listens for new events, delivering each event once through `onEvent`.

## Types

```typescript
export type FeedControllerOptions = FeedCompilerOptions & {
  feed: Feed
  tracker?: Tracker
  onEvent?: (event: TrustedEvent) => void
  onExhausted?: () => void
  useWindowing?: boolean
}
```

`tracker` records the relays each event was seen on. A tracker shared between controllers suppresses events it has already seen.

## FeedController Class

```typescript
export class FeedController {
  compiler: FeedCompiler

  constructor(readonly options: FeedControllerOptions)

  // Memoized; undefined when the feed cannot be compiled
  getRequestItems(): Promise<RequestItem[] | undefined>

  // Memoized
  getLoader(): Promise<(limit: number) => Promise<void>>

  // Loads the next page, continuing from the previous call
  load(limit: number): Promise<void>

  // Memoized
  getListener(): Promise<() => () => void>

  // Listens for new events and returns an unsubscribe function
  listen(): () => Promise<void>
}
```

## Loading Strategies

### Request-based Loading

For feeds that compile to `RequestItem[]`, the controller requests each item page by page, moving `until` back past the oldest event received. It deduplicates events across items and calls `onExhausted` when every item is exhausted. Without windowing, an item is exhausted when a page returns no events.

### Set Operation Loading

A union, intersection or difference that cannot be compiled, because it contains a difference feed, runs a controller per sub-feed:

#### Union Feeds
- Loads all sub-feeds in parallel
- Deduplicates events by ID across sub-feeds
- Calls `onExhausted` when all sub-feeds are exhausted

#### Intersection Feeds
- Loads all sub-feeds in parallel
- Emits only events that every sub-feed has returned

#### Difference Feeds
- Loads the first feed (included) and the remaining feeds (excluded)
- Emits events from the first feed that the other feeds have not returned

## Windowing Strategy

With `useWindowing: true`, each request covers a `since`/`until` window that moves backward through time. The first window is sized by `guessFilterDelta`. Later windows are sized to about a page of events by asking the relays for a NIP-45 count, with up to three probes. Relays that cannot count get a window widened after each short page instead. An item is exhausted when a short page reaches back to the oldest `since` its filters allow.

Windowing suits relays that may not return events ordered by `created_at` descending. It does not suit relays used as algorithmic feeds, where the order is part of the result.

## Usage

```typescript
import { FeedController, makeAuthorFeed } from '@welshman/feeds'

const controller = new FeedController({
  feed: makeAuthorFeed("pubkey1", "pubkey2"),
  router,
  useWindowing: true,
  onEvent: (event) => console.log('New event:', event.id),
  onExhausted: () => console.log('No more events'),
  getPubkeysForScope: (scope) => [...],
  getPubkeysForWOTRange: (min, max) => [...]
})

await controller.load(50)

// Continues from where the first page ended
await controller.load(50)

const unlisten = controller.listen()

unlisten()
```
