# Feed Compiler

The `FeedCompiler` class transforms feed definitions into optimized `RequestItem[]` arrays containing filters and relay selections for efficient event fetching.

## Types

```typescript
export type FeedCompilerOptions = {
  signer?: ISigner
  signal?: AbortSignal
  context?: AdapterContext
  getPubkeysForScope: (scope: Scope) => string[]
  getPubkeysForWOTRange: (minWOT: number, maxWOT: number) => string[]
}
```

## FeedCompiler Class

```typescript
export class FeedCompiler {
  constructor(readonly options: FeedCompilerOptions)

  // Check if a feed can be compiled
  canCompile(feed: Feed): boolean

  // Compile a feed into request items
  async compile(feed: Feed): Promise<RequestItem[]>
}
```

## Compilation Logic

### Basic Feed Types

- **ID feeds** → `{filters: [{ids: [...]}]}`
- **Kind feeds** → `{filters: [{kinds: [...]}]}`
- **Author feeds** → `{filters: [{authors: [...]}]}`
- **Tag feeds** → `{filters: [{[key]: [...values]}]}`
- **Address feeds** → Converts to ID filters using `getIdFilters()`
- **Relay feeds** → `{relays: [...urls]}`
- **Global feeds** → `{filters: [{}]}`

### Time-based Feeds

- **CreatedAt feeds** → Processes `since`/`until` with optional relative timestamps
- **Scope feeds** → Resolves to author filters using `getPubkeysForScope()`
- **WOT feeds** → Resolves to author filters using `getPubkeysForWOTRange()`
- **Search feeds** → `{filters: [{search: "term"}]}`

### Complex Feed Types

- **DVM feeds** → Requests DVM responses and converts result tags to feeds
- **List feeds** → Fetches list events and converts their tags to feeds
- **Label feeds** → Fetches label events (kind 1985) and converts tags to feeds

### Set Operations

- **Union feeds** → Merges all sub-feed results, optimizing by relay
- **Intersection feeds** → Finds overlapping filters and relays across sub-feeds

## Usage

```typescript
import { FeedCompiler, makeAuthorFeed, makeKindFeed } from '@welshman/feeds'

const compiler = new FeedCompiler({
  getPubkeysForScope: (scope) => [...], // Your scope resolution logic
  getPubkeysForWOTRange: (min, max) => [...], // Your WOT logic
  context: adapterContext,
  signal: abortSignal
})

// Compile a simple feed
const feed = makeAuthorFeed("pubkey1", "pubkey2")
const requests = await compiler.compile(feed)
// => [{filters: [{authors: ["pubkey1", "pubkey2"]}]}]

// Check if feed can be compiled
if (compiler.canCompile(feed)) {
  const requests = await compiler.compile(feed)
}
```
