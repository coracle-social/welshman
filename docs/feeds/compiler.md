# Feed Compiler

`FeedCompiler` turns a feed into `RequestItem[]`, each holding filters, relays, or both.

## Types

```typescript
export type FeedCompilerOptions = {
  router: FeedRouter
  signer?: ISigner
  signal?: AbortSignal
  context?: AdapterContext
  getPubkeysForScope: (scope: Scope) => string[]
  getPubkeysForWOTRange: (minWOT: number, maxWOT: number) => string[]
}
```

`router` resolves relay selections for list, label and DVM requests; `app.use(Router)` implements it. `signer` signs DVM requests and defaults to an ephemeral key.

## FeedCompiler Class

```typescript
export class FeedCompiler {
  constructor(readonly options: FeedCompilerOptions)

  // False for difference feeds, and for unions and intersections that contain one
  canCompile(feed: Feed): boolean

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
- **Search feeds** → `{filters: [{search: "term"}]}`

### Time-based Feeds

- **CreatedAt feeds** → `{filters: [{since, until}]}`. A value listed in `relative` is an offset in seconds before now.

### Pubkey Feeds

- **Scope feeds** → Author filters from `getPubkeysForScope()`
- **WOT feeds** → Author filters from `getPubkeysForWOTRange(min, max)`, with `min` defaulting to 0 and `max` to 1

### Complex Feed Types

- **DVM feeds** → Publishes a DVM request and converts the tags in each result's content to feeds
- **List feeds** → Fetches list events and converts their tags to feeds
- **Label feeds** → Fetches label events (kind 1985) and converts their tags to feeds

Each converts tags with the item's `mappings`, or `defaultTagFeedMappings`, and compiles the resulting feeds as a union.

### Set Operations

- **Union feeds** → Groups sub-feed filters by relay and merges them
- **Intersection feeds** → Intersects the filters and relays of the sub-feeds

## Usage

```typescript
import { FeedCompiler, makeAuthorFeed, makeKindFeed } from '@welshman/feeds'

const compiler = new FeedCompiler({
  router,
  getPubkeysForScope: (scope) => [...],
  getPubkeysForWOTRange: (min, max) => [...],
  context: adapterContext,
  signal: abortSignal
})

const feed = makeAuthorFeed("pubkey1", "pubkey2")

if (compiler.canCompile(feed)) {
  const requests = await compiler.compile(feed)
  // => [{filters: [{authors: ["pubkey1", "pubkey2"]}]}]
}
```
