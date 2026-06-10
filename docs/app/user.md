# User Data Loading

The User Data module provides utilities for loading and managing user-specific data like profiles, follows, mutes, pins, and relay selections. It includes both reactive stores and manual loading functions.

## User Data Stores

These reactive stores automatically load and cache user data:

```typescript
// User profile
export const userProfile: Store<Profile | undefined>

// User follows list
export const userFollowList: Store<List | undefined>

// User mutes list  
export const userMuteList: Store<List | undefined>

// User pins list
export const userPinList: Store<List | undefined>

// User relay selections
export const userRelayList: Store<List | undefined>

// User messaging relay selections
export const userMessagingRelayList: Store<List | undefined>

// User blossom servers
export const userBlossomServerList: Store<List | undefined>
```

## Manual Loading Functions

These functions load user data for the currently signed-in user with optional relay hints:

```typescript
// Load user profile
function loadUserProfile(relays?: string[]): Promise<void>

// Load user follows
function loadUserFollowList(relays?: string[]): Promise<void>

// Load user mutes
function loadUserMuteList(relays?: string[]): Promise<void>

// Load user pins
function loadUserPinList(relays?: string[]): Promise<void>

// Load user relay selections
function loadUserRelayList(relays?: string[]): Promise<void>

// Load user messaging relay selections
function loadUserMessagingRelayList(relays?: string[]): Promise<void>

// Load user blossom servers
function loadUserBlossomServerList(relays?: string[]): Promise<void>
```

Force-reload variants bypass the cache and always fetch fresh data:

```typescript
function forceLoadUserProfile(relays?: string[]): Promise<void>
function forceLoadUserFollowList(relays?: string[]): Promise<void>
function forceLoadUserMuteList(relays?: string[]): Promise<void>
function forceLoadUserPinList(relays?: string[]): Promise<void>
function forceLoadUserRelayList(relays?: string[]): Promise<void>
function forceLoadUserMessagingRelayList(relays?: string[]): Promise<void>
function forceLoadUserBlossomServerList(relays?: string[]): Promise<void>
```

## Usage Examples

### Using Reactive Stores
```typescript
import { userProfile, userFollowList } from '@welshman/app'

// Subscribe to user profile changes
userProfile.subscribe(profile => {
  if (profile) {
    console.log('User profile:', profile)
  }
})

// Get current follows list
const follows = userFollowList.get()
```

### Manual Loading
```typescript
import { loadUserMuteList, forceLoadUserRelayList } from '@welshman/app'

// Load user mutes from specific relays
await loadUserMuteList(['wss://relay1.com', 'wss://relay2.com'])

// Force refresh user relay selections
await forceLoadUserRelayList([])

// Load from default relays
await loadUserProfile()
```
