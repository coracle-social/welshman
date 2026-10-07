# Repository

Reactive Svelte stores for querying events from a Repository with automatic updates.

## Event Stores

Each of these is a [`Projection`](./projection#projection-t): subscribe to it or to its `.$`, and `get()` it for a snapshot. The getter runs the matching one-shot repository query rather than standing the derived store up, so a caller never pairs the two halves itself.

```typescript
// Derive map of events by ID
deriveEventsById(options: {
  repository: Repository
  filters: Filter[]
  includeDeleted?: boolean
}): Projection<Map<string, TrustedEvent>>

// Convert events by ID to array
deriveEvents(options: { repository: Repository, filters: Filter[], includeDeleted?: boolean }): Projection<TrustedEvent[]>

// Sort events ascending by created_at
deriveEventsAsc(eventsById: Projection<Map<string, TrustedEvent>>): Projection<TrustedEvent[]>

// Sort events descending by created_at
deriveEventsDesc(eventsById: Projection<Map<string, TrustedEvent>>): Projection<TrustedEvent[]>

// Derive single event by ID or address
makeDeriveEvent(options: { repository: Repository, includeDeleted?: boolean, onDerive?: (filters: Filter[], ...args: any[]) => void }): (idOrAddress: string, ...args: any[]) => Projection<TrustedEvent | undefined>

// Track if event is deleted
deriveIsDeleted(repository: Repository, event: TrustedEvent): Projection<boolean>
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
}): ItemCollection<T>

// A Projection over the index, plus a read that waits out the parses it has outstanding.
// An `eventToItem` that decrypts commits a microtask or a signer round trip after the
// event was read, so `read(key)` is how a caller gets an item the collection has seen
// the event for but not yet parsed. An indexed item comes back synchronously.
type ItemCollection<T> = Projection<Map<string, T>> & {
  read: (key: string) => MaybeAsync<Maybe<T>>
}

// Convert itemsByKey map to array
deriveItems<T>(itemsByKeyStore: Readable<Map<string, T>>): Readable<T[]>

// Create function to derive single item by key
makeDeriveItem<T>(
  itemsByKeyStore: Readable<Map<string, T>>,
  onDerive?: (key: string, ...args: any[]) => void
): (key: string, ...args: any[]) => Readable<T | undefined>

// Create cached loader with a staleness window in seconds and exponential backoff
makeLoadItem<T>(
  loadItem: (key: string, ...args: any[]) => Promise<unknown>,
  getItem: (key: string, ...args: any[]) => MaybeAsync<T | undefined>,
  options?: {getFetched?, setFetched?, getSource?, maxSize?, timeout?}
): (key: string, ...args: any[]) => Promise<T | undefined>

// Create loader that always fetches fresh data
makeForceLoadItem<T>(
  loadItem: (key: string, ...args: any[]) => Promise<unknown>,
  getItem: (key: string, ...args: any[]) => MaybeAsync<T | undefined>
): (key: string, ...args: any[]) => Promise<T | undefined>
```

## Example

```typescript
import {parseJson} from "@welshman/lib"
import {Repository} from "@welshman/net"
import {deriveEvents, deriveItemsByKey, deriveItems} from "@welshman/store"
import {PROFILE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"

const repository = new Repository()

type Profile = {event: TrustedEvent; name?: string; about?: string}

// Reactive store of text notes
const notes = deriveEvents({ repository, filters: [{kinds: [1], limit: 100}] })

// Reactive store of profiles indexed by pubkey
const profilesByPubkey = deriveItemsByKey<Profile>({
  repository,
  filters: [{kinds: [PROFILE]}],
  eventToItem: event => ({event, ...parseJson(event.content)}),
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
