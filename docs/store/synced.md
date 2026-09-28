# Synced Store

Svelte stores that persist to and restore from a storage provider.

## Functions

### synced(config)

**Parameters:**
- `config` - Configuration object containing:
  - `key` - Storage key to store the value under
  - `storage` - Storage provider implementing the StorageProvider interface
  - `defaultValue` - Default value if nothing exists in storage

**Returns:** `Synced<T>` - A writable Svelte store with a `ready` promise

The store starts at `defaultValue` and loads the stored value asynchronously, replacing the default unless storage returns `undefined`. `ready` resolves once that load completes. From then on, every value is written back to storage.

### sync(config)

Binds an existing writable `store` to `storage` under `key`, with the same load-then-save behavior. It returns the promise that `synced` exposes as `ready`.

## Storage Provider Interface

```typescript
interface StorageProvider {
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<void>
}
```

`localStorageProvider` is the built-in provider. It stores values as JSON in `localStorage`.

## Example

```typescript
import {synced, localStorageProvider} from "@welshman/store"

const userPreferences = synced({
  key: "user-prefs",
  storage: localStorageProvider,
  defaultValue: {
    theme: "dark",
    notifications: true,
    language: "en"
  }
})

await userPreferences.ready

userPreferences.subscribe(prefs => {
  console.log("Preferences:", prefs)
})

// Saves to storage
userPreferences.update(prefs => ({
  ...prefs,
  theme: "light"
}))
```
