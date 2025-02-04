# Feed Compiler

The `FeedCompiler` class is responsible for transforming feed definitions into executable relay requests. It handles the complex task of converting various feed types into optimized filters and relay selections.

## Overview

```typescript
class FeedCompiler {
  constructor(readonly options: FeedOptions)

  canCompile(feed: Feed): boolean
  compile(feed: Feed): Promise<RequestItem[]>
}
```

## Feed Compilation Process

The compiler transforms feed definitions into `RequestItem[]`, where each item contains:
```typescript
type RequestItem = {
  relays?: string[]    // Specific relays to query
  filters?: Filter[]   // Nostr filters to apply
}
```

## Examples

### Basic Feed Compilation
```typescript
const compiler = new FeedCompiler(options)

// Simple author feed
const feed = [FeedType.Author, "pubkey1", "pubkey2"]
const requests = await compiler.compile(feed)
// => [{ filters: [{ authors: ["pubkey1", "pubkey2"] }] }]
```

### Complex Feed Compilation
```typescript
// Complex feed with multiple operations
const feed = [
  FeedType.Intersection,
  [FeedType.Kind, 1],
  [
    FeedType.Union,
    [FeedType.Scope, Scope.Follows],
    [FeedType.List, { addresses: ["trending"] }]
  ]
]

const requests = await compiler.compile(feed)
// Compiles to optimized filters for relay queries
```

### DVM Integration
```typescript
const feed = [
  FeedType.DVM,
  {
    kind: 5300,
    mappings: [
      ["p", [FeedType.Author]],
      ["t", [FeedType.Tag, "#t"]]
    ]
  }
]

const requests = await compiler.compile(feed)
// Queries DVM and compiles resulting tags into feeds
```

## Implementation Notes

### Optimization Strategies

1. **Filter Merging**: Similar filters are combined when possible
   ```typescript
   // Before: [{ authors: ["a"] }, { authors: ["b"] }]
   // After: [{ authors: ["a", "b"] }]
   ```

2. **Relay Grouping**: Requests are grouped by relay where possible
   ```typescript
   // Filters are organized by relay to minimize connections
   filtersByRelay: Map<string, Filter[]>
   ```

3. **Deduplication**: Duplicate values are removed using `uniq`
   ```typescript
   uniq(scopes.flatMap(this.options.getPubkeysForScope))
   ```

### Error Handling

The compiler includes various safety checks:
```typescript
canCompile(feed: Feed): boolean {
  // Checks if feed type is supported
  // Recursively checks sub-feeds
}
```
