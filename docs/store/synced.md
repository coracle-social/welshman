# Synced Store

Utility for creating Svelte stores that automatically persist to and restore from localStorage.

## Functions

### synced(key, defaultValue)

Creates a writable store that synchronizes with localStorage using JSON serialization.

**Parameters:**
- `key` - localStorage key to store the value under
- `defaultValue` - Default value if nothing exists in localStorage

**Returns:** Writable Svelte store that persists changes to localStorage

The store automatically:
- Loads initial value from localStorage on creation
- Saves any changes back to localStorage
- Falls back to defaultValue if localStorage is empty or invalid

## Example

```typescript
import {synced} from "@welshman/store"

// Create a store that persists user preferences
const userPreferences = synced("user-prefs", {
  theme: "dark",
  notifications: true,
  language: "en"
})

// Use like any writable store
userPreferences.subscribe(prefs => {
  console.log("Preferences:", prefs)
})

// Update the store - automatically saves to localStorage
userPreferences.update(prefs => ({
  ...prefs,
  theme: "light"
}))
```
