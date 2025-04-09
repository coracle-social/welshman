# Storage

The storage system provides IndexedDB persistence for stores and repositories.

Initialize this early in your application lifecycle to ensure data consistency.

```typescript
import {initStorage, defaultStorageAdapters} from '@welshman/app'

// Use default storage adapters, which track important metadata events,
// relays, handles, zappers, etc.
await initStorage("my-db", 1, {
  ...defaultStorageAdapters,
  custom: {
    keyPath: "key",
    init: async () => console.log(await getAll("custom")),
    sync: () => {
      // Set up a listener for changes, using bulkPut to save records.
      // Return an unsubscribe function for cleanup
    },
  },
})
```

The storage system:

- Persists data across page reloads
- Throttles writes for performance
- Syncs bidirectionally
- Supports custom adapters

Initialize storage before making any subscriptions or loading data to ensure proper caching behavior.
