# Repository

The Repository module provides a robust in-memory event storage system with indexing, querying, and event replacement capabilities.

## Core Features

- Event storage and indexing
- Query support with multiple filters
- Event replacement and deletion tracking
- Event update notifications
- Optimized indexes for common queries

## Class Definition

```typescript
class Repository<E extends HashedEvent = TrustedEvent> extends Emitter {
  // Storage indexes
  eventsById = new Map<string, E>()
  eventsByWrap = new Map<string, E>()
  eventsByAddress = new Map<string, E>()
  eventsByTag = new Map<string, E[]>()
  eventsByDay = new Map<number, E[]>()
  eventsByAuthor = new Map<string, E[]>()
  eventsByKind = new Map<number, E[]>()
  deletes = new Map<string, number>()
}
```

## Core Methods

### Event Management
```typescript
// Store or update event
publish(event: E, opts = { shouldNotify: true }): boolean

// Get event by ID or address
getEvent(idOrAddress: string): E | undefined

// Check if event exists
hasEvent(event: E): boolean

// Remove event
removeEvent(idOrAddress: string): void

// Check deletion status
isDeleted(event: E): boolean
isDeletedByAddress(event: E): boolean
isDeletedById(event: E): boolean
```

### Querying
```typescript
// Query events with filters
query(
  filters: Filter[],
  opts = {
    includeDeleted: false,
    shouldSort: true
  }
): E[]

// Dump all events
dump(): E[]

// Load events in bulk
load(events: E[], chunkSize = 1000): void
```

## Usage Examples

### Basic Repository Operations
```typescript
// Create repository
const repo = new Repository<TrustedEvent>()

// Add events
repo.publish(event)

// Query events
const events = repo.query([
  { kinds: [1], limit: 100 }
])

// Check event status
if (!repo.isDeleted(event)) {
  processEvent(event)
}
```

### Bulk Operations
```typescript
// Load multiple events
repo.load(events, 500) // Process in chunks of 500

// Get all events
const allEvents = repo.dump()
```

### Query Examples
```typescript
// Query with multiple filters
const events = repo.query([
  // Recent events from specific authors
  {
    kinds: [1],
    authors: ['pub1', 'pub2'],
    since: now() - 24 * 60 * 60
  },
  // Events with specific tags
  {
    '#t': ['bitcoin', 'nostr'],
    limit: 50
  }
])
```
