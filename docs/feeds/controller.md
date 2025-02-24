# Feed Controller

The `FeedController` class is responsible for managing and executing feed queries in a performant and organized manner. It handles the compilation of feed definitions into executable queries and manages the loading of events based on those queries.

## Usage

```typescript
import { FeedController } from '@welshman/feeds'

const controller = new FeedController({
  feed: yourFeedDefinition,
  request: async ({ filters, relays, onEvent }) => {
    // Your implementation for fetching events
  },
  requestDVM: async ({ kind, tags, relays, onEvent }) => {
    // Your implementation for DVM requests
  },
  getPubkeysForScope: (scope) => {
    // Return pubkeys for given scope
    return ['pubkey1', 'pubkey2']
  },
  getPubkeysForWOTRange: (min, max) => {
    // Return pubkeys within WOT range
    return ['pubkey1', 'pubkey2']
  },
  onEvent: (event) => {
    // Handle received events
  },
  onExhausted: () => {
    // Called when no more events are available
  },
  useWindowing: true, // Optional: enable time-window based loading
})
```

## API Reference

### Constructor

```typescript
constructor(options: FeedOptions)
```

Creates a new feed controller with the given options:
- `feed`: The feed definition to execute
- `request`: Function to fetch events from relays
- `requestDVM`: Function to fetch events from DVMs
- `getPubkeysForScope`: Function to get pubkeys for a scope
- `getPubkeysForWOTRange`: Function to get pubkeys within a WOT range
- `onEvent`: Optional callback for received events
- `onExhausted`: Optional callback when feed is exhausted
- `useWindowing`: Optional flag to enable time-window based loading

### Methods

#### `load(limit: number): Promise<void>`
```typescript
const controller = new FeedController(options)
await controller.load(10) // Load 10 events
```
Loads events from the feed up to the specified limit.

#### `getLoader(): Promise<(limit: number) => Promise<void>>`
Gets the loader function for this feed. Usually called internally by `load()`.

#### `getRequestItems(): Promise<RequestItem[] | undefined>`
Gets the compiled request items for this feed. Usually called internally.

## Advanced Features

### Time Windowing

When `useWindowing` is enabled, the controller uses a time-based window approach to load events:

```typescript
const controller = new FeedController({
  ...options,
  useWindowing: true
})
```

This is useful for:
- Loading recent events first
- Handling large datasets efficiently
- Progressive loading of historical data


## Examples

### Basic Loading

```typescript
const controller = new FeedController(options)
await controller.load(20) // Load 20 events
```

### Custom Loading Strategy

```typescript
const controller = new FeedController({
  ...options,
  useWindowing: true,
  onEvent: (event) => {
    console.log('Received event:', event.id)
  },
  onExhausted: () => {
    console.log('No more events available')
  }
})

// Load events in batches
async function loadAllEvents() {
  while (!exhausted) {
    await controller.load(10)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}
```

### Error Handling

```typescript
try {
  await controller.load(10)
} catch (error) {
  if (error.message.includes('relay')) {
    // Handle relay errors
  } else {
    // Handle other errors
  }
}
```
