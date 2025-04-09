# Making Requests

Welshman extends Nostr's base subscription model with intelligent caching, repository integration, and configurable behaviors.

## Key Concepts

- **Local Repository**: Events are automatically cached and tracked
- **Cache Intelligence**: Smart decisions about when to use cached data
- **Relay Integration**: Works with the router for optimal relay selection
- **Configurable Behavior**: Control caching and timeouts

## Request and Load

The base functionality for subscription management is implemented in `@welshman/net`. Please refer to [the documentation](/net) for that module for details.

## Collections and Loaders

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

### Deriving Events

The best way to create collections is by deriving their contents from the app `repository` using `deriveEvents` from `@welshman/store`. For more control, use `deriveEventsMapped`.

```typescript
import {deriveEventsMapped} from "@welshman/store"

export const notes = deriveEvents<TrustedEvent>(repository, {filters: [{kinds: [NOTE]}]})
```

A collection could then be created by passing the `notes` store to `collection`.

### Available Collections

Several common collections are built-in and ready for use:

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

### Example - Loading and Displaying Profiles

```typescript
import {get} from 'svelte/store'
import {displayProfile} from '@welshman/util'
import {deriveProfile, deriveProfileDisplay} from '@welshman/app'

// Subscribe to profile changes - this will automatically load the profile in the background
const profile = deriveProfile(pubkey)

// Display with fallback
const name = displayProfile(get(profile), 'unknown')

// Better: use built-in deriveProfileDisplay utility
const name = deriveProfileDisplay(pubkey)
```

### User-Specific Collections

Several modules provide user-specific derived stores that automatically load data for the currently signed-in user:

```typescript
import { userProfile, userFollows, userMutes, userPins } from '@welshman/app'

userProfile.subscribe(profile => {
  // Current user's profile data
})

userFollows.subscribe(follows => {
  // Current user's follow list
})
```

### Repository Integration

All events from subscriptions are automatically:

- Saved to the repository
- Tracked to their source relay
- Checked against deletion status

The repository serves as an intelligent cache layer, making subsequent queries for the same data faster.

## Feeds

A high-level feed loader utility is also provided, which combines application state with utilities from `@welshman/net` and `@welshman/feeds`.

```typescript
import {NOTE} from '@welshman/util'
import {makeKindFeed} from '@welshman/feeds'
import {createFeedController} from '@welshman/app'

const abortController = new AbortController()

let done = false

const ctrl = createFeedController({
  feed: makeKindFeed(NOTE),
  useWindowing: true,
  signal: abortController.signal,
  onEvent: e => {
    console.log(e)
  },
  onExhausted: () => {
    done = true
  },
})

// Load some notes
ctrl.load(100)

// Cancel any pending requests
abortController.abort()
```
