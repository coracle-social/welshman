# Collection

Utilities for creating reactive collections with automatic loading, caching, and staleness management using Svelte stores.

## Functions

### collection(options)

Creates a reactive collection that automatically loads missing items and manages freshness.

**Options:**
- `name` - Collection name for freshness tracking
- `store` - Readable store containing array of items
- `getKey` - Function to extract unique key from items
- `load` - Async function to load missing items

**Returns:**
- `indexStore` - Derived store with items indexed by key
- `deriveItem(key, relays)` - Creates a derived store for a specific item
- `loadItem(key, relays)` - Manually loads an item
- `onItem(callback)` - Subscribe to individual item updates

### makeCachedLoader(options)

Creates a cached loader function with staleness checking and exponential backoff.

**Options:**
- `name` - Loader name for freshness tracking
- `indexStore` - Store containing indexed items
- `load` - Async function to load items
- `subscribers` - Array of item update subscribers

### Freshness Management

- `getFreshness(ns, key)` - Get last update timestamp for an item
- `setFreshnessImmediate(update)` - Immediately update freshness
- `setFreshnessThrottled(update)` - Throttled freshness updates

## Example

```typescript
import {writable} from 'svelte/store'
import {derived, readable} from "svelte/store"
import {readProfile, PROFILE, PublishedProfile} from "@welshman/util"
import {Repository} from "@welshman/relay"
import {deriveEventsMapped, collection, withGetter} from "@welshman/store"

const repository = new Repository()

export const profiles = writable([])

export const {
  indexStore: profilesByPubkey,
  deriveItem: deriveProfile,
  loadItem: loadProfile,
} = collection({
  name: "profiles",
  store: profiles,
  getKey: profile => profile.event.pubkey,
  load: (pubkey: string) => // Load the user's profile
})

// Get a reactive store for a specific profile
const hints = [/* optional relay hints to load from */]
const userProfile = deriveProfile("user-pubkey", hints)

// Subscribe to profile updates
userProfile.subscribe(profile => {
  console.log("Profile updated:", profile)
})
```
