# Synced Store

Utility for creating Svelte stores that automatically persist to and restore from storage providers.

## Functions

### synced(config)

Creates a writable store that synchronizes with a storage provider using JSON serialization.

**Parameters:**
- `config` - Configuration object containing:
  - `key` - Storage key to store the value under
  - `storage` - Storage provider implementing the StorageProvider interface
  - `defaultValue` - Default value if nothing exists in storage

**Returns:** `Synced<T>` - A writable Svelte store with a `ready` promise that resolves when initial storage loading completes

The store automatically:
- Loads initial value from storage asynchronously on creation
- Saves any changes back to storage
- Falls back to defaultValue if storage is empty or invalid
- Provides a `ready` promise that resolves when initial loading is complete

## Storage Provider Interface

```typescript
interface StorageProvider {
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<void>
}
```

## Example

```typescript
import {synced, localStorageProvider} from "@welshman/store"

// Create a store that persists user preferences using localStorage
const userPreferences = synced({
  key: "user-prefs",
  storage: localStorageProvider,
  defaultValue: {
    theme: "dark",
    notifications: true,
    language: "en"
  }
})

// Wait for initial loading to complete if needed
await userPreferences.ready

// Use like any writable store
userPreferences.subscribe(prefs => {
  console.log("Preferences:", prefs)
})

// Update the store - automatically saves to storage
userPreferences.update(prefs => ({
  ...prefs,
  theme: "light"
}))
```
