# Collection Stores

The `collection` utility creates stores that handle caching, loading, and indexing of Nostr data. It provides a consistent pattern for managing entities that need to be fetched from the network and cached locally.

```typescript
const {
  indexStore,    // Map of all items by key
  deriveItem,    // Get reactive item by key
  loadItem       // Trigger network load
} = collection({
  name: "storeName",      // For persistence
  store: writable([]),    // Base store
  getKey: item => item.id // How to index items
  load: async (key) => {  // Network loader
    // Load logic here
  }
})
```

## Available Collections

```typescript
// Profiles
profiles → profilesByPubkey → deriveProfile → loadProfile

// Lists
follows → followsByPubkey → deriveFollows → loadFollows
mutes → mutesByPubkey → deriveMutes → loadMutes
pins → pinsByPubkey → derivePins → loadPins

// Relays
relays → relaysByUrl → deriveRelay → loadRelay
relaySelections → relaySelectionsByPubkey → deriveRelaySelections → loadRelaySelections
inboxRelaySelections → inboxRelaySelectionsByPubkey → deriveInboxRelaySelections → loadInboxRelaySelections

// Identity
handles → handlesByNip05 → deriveHandle → loadHandle
zappers → zappersByLnurl → deriveZapper → loadZapper
```

## Real World Examples

### Loading and Displaying Profiles

```typescript
import {
  deriveProfile,
  loadProfile,
  displayProfile
} from '@welshman/app'

// In a Svelte component
let profile

// Subscribe to profile changes
$: profile = $deriveProfile(pubkey)

// Load automatically triggers when needed
onMount(() => {
  loadProfile(pubkey, {
    // Optional request params
    relays: ["wss://relay.example.com"]
  })
})

// Display with fallback
$: name = displayProfile(profile, "unknown")
```

### Managing Relay Selections

```typescript
import {
  deriveRelaySelections,
  loadRelaySelections,
  getReadRelayUrls,
  getWriteRelayUrls
} from '@welshman/app'

// Get user's relay preferences
const selections = deriveRelaySelections(pubkey).get()

// Load from network if needed
await loadRelaySelections(pubkey)

// Get read/write URLs
const readRelays = getReadRelayUrls(selections)
const writeRelays = getWriteRelayUrls(selections)

// Use with router
const relays = ctx.app.router
  .FromPubkey(pubkey)
  .getUrls()
```

Each collection automatically:
- Caches to IndexedDB
- Deduplicates network requests
- Updates reactively
- Provides typed access
- Handles loading states

The pattern is consistent across all stores, making it predictable to work with different types of nostr data.
