# Sync

The Sync utilities in `@welshman/net` provide methods for synchronizing events between relays and repositories, primarily using NIP-77 (Negentropy) when available, with fallback to traditional sync methods.

## Overview

```typescript
import {sync, pull, push} from '@welshman/net'

// Three main operations:
// 1. pull: Get events from relays
// 2. push: Send events to relays
// 3. sync: Bidirectional sync
```

These utilities are primarily used by:
- `Repository` for syncing with relays
- `FeedController` for initial feed loading

## Basic Usage

```typescript
import {sync, pull, getFilterSelections} from '@welshman/net'

// Sync user profile data
const syncProfiles = async (pubkeys: string[]) => {
  await sync({
    // What to sync
    filters: [{
      kinds: [0],
      authors: pubkeys
    }],

    // Which relays
    relays: ctx.app.router
      .ForPubkeys(pubkeys)
      .getUrls(),

    // Local events to consider
    events: repository.query([{
      kinds: [0],
      authors: pubkeys
    }])
  })
}

// Initial feed load with negentropy
const loadFeed = async () => {
  await pull({
    filters: [{
      kinds: [1],
      limit: 100
    }],
    relays: ctx.app.router
      .ForUser()
      .getUrls(),
    events: [], // No local events yet
    onEvent: (event) => {
      // Handle new events
    }
  })
}
```

Sync operations:
- Use NIP-77 when supported by relay
- Fall back to traditional sync
- Handle bidirectional sync
- Support filtered sync
- Track sync progress
