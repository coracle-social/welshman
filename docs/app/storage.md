# Storage

The storage system provides IndexedDB persistence for stores and repositories.
It's critical to initialize this early in your application lifecycle to ensure data consistency.

```typescript
import {
  initStorage,
  storageAdapters,
  throttled,
  repository,
  tracker,
  relays,
  handles,
  freshness,
  plaintext
} from '@welshman/app'

// Real world example from Coracle
const initializeStorage = async () => {
  const ready = initStorage("coracle-db", 1, {
    // Persist relay info
    relays: {
      keyPath: "url",
      store: throttled(3000, relays)
    },

    // Persist NIP-05 handles
    handles: {
      keyPath: "nip05",
      store: throttled(3000, handles)
    },

    // Track data freshness
    freshness: storageAdapters.fromObjectStore(
      freshness,
      {throttle: 3000}
    ),

    // Store decrypted content
    plaintext: storageAdapters.fromObjectStore(
      plaintext,
      {throttle: 3000}
    ),

    // Store events and their sources
    events: storageAdapters.fromRepositoryAndTracker(
      repository,
      tracker,
      {throttle: 3000}
    )
  })

  // Wait for storage to be ready
  await ready

  // App can now start loading data
}
```

The storage system:
- Persists data across page reloads
- Throttles writes for performance
- Handles store migrations
- Syncs bidirectionally
- Supports custom adapters

Initialize storage before making any subscriptions or loading data to ensure proper caching behavior.
