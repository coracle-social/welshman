# Filters

The Filters module provides utilities for creating, manipulating, and matching Nostr event filters. It includes support for filter operations, optimization, and time-based filtering.

## API

### Filter Matching

```typescript
// Check if an event matches a filter
export declare const matchFilter: <E extends HashedEvent>(filter: Filter, event: E) => boolean;

// Check if an event matches any filter in array
export declare const matchFilters: <E extends HashedEvent>(filters: Filter[], event: E) => boolean;
```

### Filter Operations

```typescript
// Get a compact string representation of a filter
export declare const getFilterId: (filter: Filter) => string;

// Combine multiple filters into minimal filter set
export declare const unionFilters: (filters: Filter[]) => Filter[];

// Create intersection of filter groups
export declare const intersectFilters: (groups: Filter[][]) => Filter[];

// Trim large filter arrays to avoid relay limits
export declare const trimFilter: (filter: Filter) => Filter;
export declare const trimFilters: (filters: Filter[]) => Filter[];
```

### Specialized Filter Creation

```typescript
// Create filters for finding events by ID or address
export declare const getIdFilters: (idsOrAddresses: string[]) => Filter[];

// Create filters for finding replies to events
export declare const getReplyFilters: (events: TrustedEvent[], filter?: Filter) => Filter[];

// Add repost filters (kinds 6, 16) to existing filters
export declare const addRepostFilters: (filters: Filter[]) => Filter[];
```

### Filter Analysis

```typescript
// Calculate filter generality (0 = specific, 1 = very general)
export declare const getFilterGenerality: (filter: Filter) => number;

// Estimate time delta for filter results
export declare const guessFilterDelta: (filters: Filter[], max?: number) => number;

// Get expected result count for ID-based filters
export declare const getFilterResultCardinality: (filter: Filter) => number | undefined;
```

## Examples

### Basic Filter Matching

```typescript
import { matchFilter, matchFilters, NOTE, LONG_FORM } from '@welshman/util';

const event = {
  id: 'abc123...',
  kind: 1,
  pubkey: 'def456...',
  created_at: 1234567890,
  content: 'Hello Nostr!',
  tags: [['t', 'nostr']]
};

// Single filter matching
const filter = { kinds: [NOTE], authors: ['def456...'] };
const matches = matchFilter(filter, event); // true

// Multiple filter matching
const filters = [
  { kinds: [NOTE] },
  { kinds: [LONG_FORM], authors: ['def456...'] }
];
const matchesAny = matchFilters(filters, event); // true (matches first filter)
```

### Creating Filters for IDs and Addresses

```typescript
import { getIdFilters } from '@welshman/util';

// Mix of event IDs and addresses
const references = [
  'abc123...', // event ID
  '30023:def456...:my-article', // address
  'ghi789...', // another event ID
];

const filters = getIdFilters(references);
// Returns: [
//   { ids: ['abc123...', 'ghi789...'] },
//   { kinds: [30023], authors: ['def456...'], '#d': ['my-article'] }
// ]
```

### Finding Replies

```typescript
import { getReplyFilters } from '@welshman/util';

const originalEvents = [
  { id: 'abc123...', kind: 1, /* ... */ },
  { id: 'def456...', kind: 30023, /* ... */ }
];

// Find all replies to these events
const replyFilters = getReplyFilters(originalEvents);
// Returns filters with #e and #a tags pointing to the original events

// Add additional constraints
const recentReplies = getReplyFilters(originalEvents, {
  since: Math.floor(Date.now() / 1000) - 3600 // last hour
});
```

### Filter Operations

```typescript
import { unionFilters, intersectFilters, trimFilters } from '@welshman/util';

// Combine overlapping filters
const filters = [
  { kinds: [1], authors: ['abc...'] },
  { kinds: [1], authors: ['def...'] },
  { kinds: [6], authors: ['abc...'] }
];

const combined = unionFilters(filters);
// Results in more efficient filter set

// Intersect filter groups
const group1 = [{ kinds: [1, 6] }];
const group2 = [{ authors: ['abc...', 'def...'] }];
const intersection = intersectFilters([group1, group2]);
// Returns: [{ kinds: [1, 6], authors: ['abc...', 'def...'] }]

// Trim oversized filters
const largeFilters = [{ authors: new Array(2000).fill('pubkey') }];
const trimmed = trimFilters(largeFilters);
// Limits arrays to 1000 items max
```

### Adding Repost Support

```typescript
import { addRepostFilters, NOTE, LONG_FORM } from '@welshman/util';

const baseFilters = [
  { kinds: [NOTE] },
  { kinds: [LONG_FORM], authors: ['abc...'] }
];

const withReposts = addRepostFilters(baseFilters);
// Automatically adds:
// - kind 6 filters for note reposts
// - kind 16 filters with #k tags for other reposts
```

### Filter Analysis

```typescript
import { getFilterGenerality, guessFilterDelta, getFilterResultCardinality } from '@welshman/util';

const specificFilter = { ids: ['abc123...'] };
const generalFilter = { kinds: [1] };

console.log(getFilterGenerality(specificFilter)); // 0 (very specific)
console.log(getFilterGenerality(generalFilter)); // 1 (very general)

// Estimate appropriate time window
const filters = [{ authors: ['abc...', 'def...'] }];
const deltaSeconds = guessFilterDelta(filters); // ~21600 (6 hours)

// Check expected result count
const idFilter = { ids: ['abc...', 'def...', 'ghi...'] };
const resultCount = getFilterResultCardinality(idFilter); // 3
```
