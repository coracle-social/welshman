# Stores and Loaders

The `@welshman/app` package provides a powerful system of collection-based reactive stores and loader utilities.

These utilities follow a consistent pattern for working with various types of Nostr data, making it easy to:

1. Query data from the repository
2. Transform it into application-specific structures
3. Access it reactively in your UI
4. Trigger network loading when needed

## Core Concept

Each collection-based module exports a similar set of utilities:

```typescript
// Common pattern across collection-based modules
export const {
  // Main collection store (derived from repository)
  store: follows,

  // Indexed map for efficient lookup
  indexStore: followsByPubkey,

  // Function to get a reactive store for a specific item
  deriveItem: deriveFollows,

  // Function to trigger loading an item from the network
  loadItem: loadFollows
} = collection({
  name: "collection-name",
  store: baseStore,
  getKey: item => item.keyProperty,
  load: async (key) => { /* Loading logic */ }
})
```

## Available Collections

| Collection | Key | Kind | Description |
|------------|-----|------|-------------|
| `follows` | pubkey | 3 | User follow lists |
| `mutes` | pubkey | 10000 | User mute lists |
| `pins` | pubkey | 10001 | User pinned items |
| `profiles` | pubkey | 0 | User profile metadata |
| `relaySelections` | pubkey | 10002 | User relay preferences |
| `inboxRelaySelections` | pubkey | 10005 | User inbox relay settings |
| `zappers` | lnurl | - | Lightning zapper metadata |
| `handles` | nip05 | - | NIP-05 identifier metadata |

## Usage Examples

### Loading and Accessing Data

```typescript
import { loadProfile, deriveProfile, profilesByPubkey } from '@welshman/app'

// Trigger loading a profile from the network
await loadProfile('pubkey123')

// Get a reactive store for a specific profile
const profile = deriveProfile('pubkey123')

// Access all profiles by pubkey
const allProfiles = profilesByPubkey.get()
const specificProfile = allProfiles.get('pubkey123')
```

### User-Specific Collections

Several modules provide user-specific derived stores that automatically load data for the currently signed-in user:

```typescript
import { userProfile, userFollows, userMutes, userPins } from '@welshman/app'

// These are derived stores that automatically:
// 1. Watch for changes to the current user's pubkey
// 2. Load the appropriate data when the user changes
// 3. Provide the data reactively

userProfile.subscribe(profile => {
  // Current user's profile data
})

userFollows.subscribe(follows => {
  // Current user's follow list
})
```

### Web of Trust Utilities

The `wot.ts` module provides additional utilities for analyzing the social graph:

```typescript
import { getFollows, getFollowers, getNetwork, getWotScore } from '@welshman/app'

// Get users followed by a pubkey
const followedUsers = getFollows('pubkey123')

// Get users following a pubkey
const followers = getFollowers('pubkey123')

// Get extended network (follows-of-follows)
const network = getNetwork('pubkey123')

// Calculate trust score between users
const score = getWotScore('userPubkey', 'targetPubkey')
```
