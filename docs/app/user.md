# User Data Loading

The User Data module provides utilities for loading and managing user-specific data like profiles, follows, mutes, pins, and relay selections. It includes both reactive stores and manual loading functions.

## Types

### UserDataLoader
```typescript
type UserDataLoader = (pubkey: string, relays?: string[], force?: boolean) => unknown
```

Function type for loading user data with optional relay specification and force refresh.

### MakeUserDataOptions
```typescript
type MakeUserDataOptions<T> = {
  mapStore: Readable<Map<string, T>>
  loadItem: UserDataLoader
}
```

Configuration for creating user data stores.

## User Data Stores

These reactive stores automatically load and cache user data:

```typescript
// User profile
export const userProfile: Store<Profile | undefined>

// User follows list
export const userFollows: Store<List | undefined>

// User mutes list  
export const userMutes: Store<List | undefined>

// User pins list
export const userPins: Store<List | undefined>

// User relay selections
export const userRelayLists: Store<List | undefined>

// User messaging relay selections
export const userMessagingRelayLists: Store<List | undefined>

// User blossom servers
export const userBlossomServers: Store<List | undefined>
```

## Manual Loading Functions

These functions allow manual loading of user data with optional relay specification and force refresh:

```typescript
// Load user profile
function loadUserProfile(relays?: string[], force?: boolean): Promise<void>

// Load user follows
function loadUserFollows(relays?: string[], force?: boolean): Promise<void>

// Load user mutes
function loadUserMutes(relays?: string[], force?: boolean): Promise<void>

// Load user pins
function loadUserPins(relays?: string[], force?: boolean): Promise<void>

// Load user relay selections
function loadUserRelayLists(relays?: string[], force?: boolean): Promise<void>

// Load user messaging relay selections
function loadUserMessagingRelayLists(relays?: string[], force?: boolean): Promise<void>

// Load user blossom servers
function loadUserBlossomServers(relays?: string[], force?: boolean): Promise<void>
```

## Usage Examples

### Using Reactive Stores
```typescript
import { userProfile, userFollows } from '@welshman/app'

// Subscribe to user profile changes
userProfile.subscribe(profile => {
  if (profile) {
    console.log('User profile:', profile)
  }
})

// Get current follows list
const follows = userFollows.get()
```

### Manual Loading
```typescript
import { loadUserMutes, loadUserRelayLists } from '@welshman/app'

// Load user mutes from specific relays
await loadUserMutes(['wss://relay1.com', 'wss://relay2.com'])

// Force refresh user relay selections
await loadUserRelayLists([], true)

// Load from default relays
await loadUserProfile()
```
