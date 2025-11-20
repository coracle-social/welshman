# Repository

Reactive Svelte stores for querying events from a Repository with automatic updates.

## Event Stores

```typescript
// Derive map of events by ID
deriveEventsById(options: {
  repository: Repository
  filters: Filter[]
  includeDeleted?: boolean
}): Readable<Map<string, TrustedEvent>>

// Convert events by ID to array
deriveEvents(eventsByIdStore: Readable<Map<string, TrustedEvent>>): Readable<TrustedEvent[]>

// Sort events ascending by created_at
deriveEventsAsc(eventsStore: Readable<TrustedEvent[]>): Readable<TrustedEvent[]>

// Sort events descending by created_at
deriveEventsDesc(eventsStore: Readable<TrustedEvent[]>): Readable<TrustedEvent[]>

// Derive single event by ID or address
deriveEvent(repository: Repository, idOrAddress: string): Readable<TrustedEvent | undefined>

// Track if event is deleted
deriveIsDeleted(repository: Repository, event: TrustedEvent): Readable<boolean>
```

## Indexed Collections

```typescript
// Create indexed map of items from repository events
deriveItemsByKey<T>(options: {
  repository: Repository
  filters: Filter[]
  eventToItem: (event: TrustedEvent) => MaybeAsync<Maybe<T>>
  getKey: (item: T) => string
  includeDeleted?: boolean
}): Readable<Map<string, T>>

// Convert itemsByKey map to array
deriveItems<T>(itemsByKeyStore: Readable<Map<string, T>>): Readable<T[]>

// Create function to derive single item by key
makeDeriveItem<T>(
  itemsByKeyStore: Readable<Map<string, T>>,
  onDerive?: (key: string, ...args: any[]) => void
): (key: string, ...args: any[]) => Readable<T | undefined>

// Create cached loader with staleness checking and exponential backoff
makeLoadItem<T>(
  loadItem: (key: string, ...args: any[]) => Promise<unknown>,
  getItem: (key: string) => T | undefined,
  options?: {getFetched?, setFetched?, timeout?}
): (key: string, ...args: any[]) => Promise<T | undefined>

// Create loader that always fetches fresh data
makeForceLoadItem<T>(
  loadItem: (key: string, ...args: any[]) => Promise<unknown>,
  getItem: (key: string) => T | undefined
): (key: string, ...args: any[]) => Promise<T | undefined>

// Optimized getter that switches to subscription when hot
getter<T>(store: Readable<T>, options?: {threshold?: number}): () => T
```

## Example

```typescript
import {Repository} from "@welshman/net"
import {deriveEventsById, deriveEvents, deriveItemsByKey, deriveItems} from "@welshman/store"
import {readProfile, PROFILE} from "@welshman/util"

const repository = new Repository()

// Reactive store of text notes
const noteEventsById = deriveEventsById({
  repository,
  filters: [{kinds: [1], limit: 100}]
})
const notes = deriveEvents(noteEventsById)

// Reactive store of profiles indexed by pubkey
const profilesByPubkey = deriveItemsByKey({
  repository,
  filters: [{kinds: [PROFILE]}],
  eventToItem: event => readProfile(event),
  getKey: profile => profile.event.pubkey
})
const profiles = deriveItems(profilesByPubkey)

// Subscribe to updates
notes.subscribe($notes => {
  console.log(`Found ${$notes.length} text notes`)
})

profiles.subscribe($profiles => {
  console.log(`Found ${$profiles.length} profiles`)
})
```
