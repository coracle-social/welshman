# Filters

The Filters module provides utilities for creating, manipulating, and matching Nostr event filters.
It includes support for filter operations, optimization, and time-based filtering.

## Core Types

```typescript
interface Filter {
  ids?: string[]         // Match specific event IDs
  kinds?: number[]       // Match event kinds
  authors?: string[]     // Match author pubkeys
  since?: number         // Match events since timestamp
  until?: number         // Match events until timestamp
  limit?: number         // Limit number of results
  search?: string        // Text search
  [key: `#${string}`]: string[] // Tag filters
}
```

## Filter Operations

### Match Events
```typescript
// Match single filter
matchFilter(filter: Filter, event: HashedEvent): boolean

// Match multiple filters
matchFilters(filters: Filter[], event: HashedEvent): boolean
```

### Combine Filters
```typescript
// Combine filters with OR operation
unionFilters(filters: Filter[]): Filter[]

// Combine filters with AND operation
intersectFilters(groups: Filter[][]): Filter[]
```

### Filter Utilities
```typescript
// Get unique filter ID
getFilterId(filter: Filter): string

// Calculate filter group
calculateFilterGroup(filter: Filter): string

// Get filters for event IDs or addresses
getIdFilters(idsOrAddresses: string[]): Filter[]

// Get filters for reply events
getReplyFilters(events: TrustedEvent[], filter?: Filter): Filter[]

// Add repost filters
addRepostFilters(filters: Filter[]): Filter[]
```

## Time Constants

```typescript
// Unix epoch for Nostr (2021-01-01)
export const EPOCH = 1609459200

// One day in seconds
export const DAY = 86400
```

## Examples

### Basic Filtering

```typescript
// Create basic filter
const filter: Filter = {
  kinds: [1], // Text notes
  authors: ['pubkey1', 'pubkey2'],
  since: now() - 24 * 60 * 60, // Last 24 hours
  limit: 100
}

// Match event against filter
if (matchFilter(filter, event)) {
  processEvent(event)
}
```

### Combining Filters

```typescript
// Union of filters (OR)
const combinedFilters = unionFilters([
  { kinds: [1], authors: ['pub1'] },
  { kinds: [1], authors: ['pub2'] }
])

// Intersection of filters (AND)
const intersectedFilters = intersectFilters([
  [{ kinds: [1] }],
  [{ authors: ['pub1'] }]
])
```

### Time-based Filtering

```typescript
// Filter events from specific time range
const timeFilter: Filter = {
  since: now() - 7 * DAY, // Last week
  until: now(),
  limit: 100
}

// Guess appropriate time window
const delta = guessFilterDelta([timeFilter])
```

### Tag Filtering

```typescript
// Filter by tags
const tagFilter: Filter = {
  '#t': ['nostr', 'bitcoin'], // Match hashtags
  '#p': ['pubkey1'],         // Match mentions
  limit: 50
}
```

## Filter Optimization

### Trim Filters
```typescript
// Trim large filters to reasonable size
const trimmedFilter = trimFilter(filter)
const trimmedFilters = trimFilters(filters)
```

### Filter Analysis
```typescript
// Get filter generality score
const score = getFilterGenerality(filter)

// Get expected result count
const count = getFilterResultCardinality(filter)
```

## Advanced Usage

### Reply Chain Filters
```typescript
// Get filters for replies
const replyFilters = getReplyFilters(events, {
  kinds: [1],
  limit: 100
})
```

### Repost Handling
```typescript
// Add filters for reposts
const withReposts = addRepostFilters([
  { kinds: [1] } // Original filter
])
// Results in filters for kinds 1, 6, and 16
```
