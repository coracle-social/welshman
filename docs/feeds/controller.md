# Feed Controller

The `FeedController` class manages feed execution with advanced loading strategies including pagination, windowing, and set operations. It compiles feeds into requests and handles event streaming with deduplication.

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

## FeedController Class

```typescript
export class FeedController {
  compiler: FeedCompiler

  constructor(readonly options: FeedControllerOptions)

  // Get compiled request items (memoized)
  getRequestItems(): Promise<RequestItem[] | undefined>

  // Get loader function (memoized)
  getLoader(): Promise<(limit: number) => Promise<void>>

  // Load events with specified limit
  load(limit: number): Promise<void>
}
```

## Loading Strategies

### Request-based Loading

For feeds that can be compiled to `RequestItem[]`:
- **Pagination**: Automatically handles `since`/`until` windowing
- **Deduplication**: Prevents duplicate events across multiple requests
- **Exhaustion tracking**: Detects when all requests are exhausted

### Set Operation Loading

For feeds requiring special handling:

#### Union Feeds
- Loads events from all sub-feeds in parallel
- Deduplicates events by ID across sub-feeds
- Signals exhaustion when all sub-feeds are exhausted

#### Intersection Feeds
- Loads events from all sub-feeds in parallel
- Only emits events that appear in ALL sub-feeds
- Uses count tracking to determine intersection

#### Difference Feeds
- Loads events from first feed (included) and remaining feeds (excluded)
- Emits events from first feed that don't appear in other feeds
- Maintains skip set for excluded events

## Windowing Strategy

When `useWindowing: true`:
- **Initial window**: Starts from recent events with estimated delta
- **Exponential backoff**: Increases window size when few events found
- **Timeline traversal**: Moves backward through time systematically
- **Performance optimization**: Gets recent events first

Windowing is best used when you don't trust relays to give you results ordered by `created_at` descending. Windowing should not be used when treating relays as algorithm feeds.

## Usage

```typescript
import { FeedController, makeAuthorFeed } from '@welshman/feeds'

const controller = new FeedController({
  feed: makeAuthorFeed("pubkey1", "pubkey2"),
  useWindowing: true,
  onEvent: (event) => console.log('New event:', event.id),
  onExhausted: () => console.log('No more events'),
  getPubkeysForScope: (scope) => [...],
  getPubkeysForWOTRange: (min, max) => [...]
})

// Load first batch of events
await controller.load(50)

// Load more events
await controller.load(50)
```
