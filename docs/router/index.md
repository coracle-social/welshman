# @welshman/router

[![version](https://badgen.net/npm/v/@welshman/router)](https://npmjs.com/package/@welshman/router)

Utilities for selecting nostr relays.

## What's Included

- **Router** - A configurable router class usable as a singleton which provides common relay selection scenarios.
- **RouterScenario** - A scenario class which scores relays based on policy.
- **getFilterSelections** - A high-level utility for inferring relay selections from filters.
- **Fallback Policies** - Functions to determine how many fallback relays to add.

## Quick Example

```typescript
import {Router, addMaximalFallbacks, getFilterSelections} from '@welshman/router'

// Configure the global router instance
Router.configure({
  getDefaultRelays: () => ['wss://relay.example.com/'],
  getPubkeyRelays: (pubkey, mode) => ['wss://myrelay.example.com/'],
  getIndexerRelays: () => ['wss://indexer.example.com/'],
  getUserPubkey: () => 'user-pubkey',
  getRelayQuality: (url) => 0.8,
  getLimit: () => 5
})

const router = Router.get()

// Get relays for reading events from specific pubkeys
const readRelays = router.FromPubkeys(['pubkey1', 'pubkey2']).getUrls()

// Get relays for publishing an event (author's outbox + mentions' messaginges)
const publishRelays = router.PublishEvent(event).getUrls()

// Try hard to find a quoted note with maximal fallbacks
const searchRelays = router
  .Quote(event, quotedEventId, hints)
  .allowLocal(true)
  .allowOnion(true)
  .allowInsecure(true)
  .policy(addMaximalFallbacks)
  .limit(10)
  .getUrls()

// Automatically select relays based on filters
const relaysAndFilters = getFilterSelections([
  {kinds: [1], authors: ['pubkey1', 'pubkey2']},
  {kinds: [0], search: 'bitcoin'}
])
```

## Installation

```bash
npm install @welshman/router
```

## Core Concepts

### Router

The main class for relay selection. Configure it once with your relay discovery functions, then use scenario methods to select relays for different purposes.

**Configuration Options:**
- `getUserPubkey()` - Returns the current user's pubkey
- `getPubkeyRelays(pubkey, mode)` - Returns relays for a pubkey ("read", "write", or "messaging")
- `getDefaultRelays()` - Returns fallback relays
- `getIndexerRelays()` - Returns relays that index profiles and relay lists
- `getSearchRelays()` - Returns relays that support NIP-50 search
- `getRelayQuality(url)` - Returns quality score (0-1) for a relay
- `getLimit()` - Returns maximum number of relays to select

**Scenario Methods:**
- `FromRelays(relays)` - Use specific relays
- `ForUser()` / `FromUser()` / `UserMessaging()` - User's read/write/messaging relays
- `ForPubkey(pubkey)` / `FromPubkey(pubkey)` / `PubkeyMessaging(pubkey)` - Pubkey's relays
- `ForPubkeys(pubkeys)` / `FromPubkeys(pubkeys)` - Multiple pubkeys' relays
- `Event(event)` - Relays for an event's author
- `PublishEvent(event)` - Relays for publishing (author + mentions)
- `Quote(event, id, hints)` - Relays for finding a quoted event
- `Search()` / `Index()` / `Default()` - Special relay types

### RouterScenario

Represents a relay selection with scoring and filtering options.

**Methods:**
- `getUrls()` - Returns selected relay URLs
- `getUrl()` - Returns first selected relay URL
- `limit(n)` - Limit number of relays
- `weight(scale)` - Scale selection weight
- `policy(fallbackPolicy)` - Set fallback policy
- `allowLocal(bool)` / `allowOnion(bool)` / `allowInsecure(bool)` - Filter relay types

### Fallback Policies

Functions that determine how many fallback relays to add:
- `addNoFallbacks` - Never add fallbacks
- `addMinimalFallbacks` - Add 1 fallback if no relays found
- `addMaximalFallbacks` - Fill up to the limit with fallbacks

### Filter Selection

`getFilterSelections(filters)` automatically chooses appropriate relays based on filter content:
- Search filters → search relays
- Wrap events → user's messaging
- Profile/relay kinds → indexer relays  
- Author filters → authors' relays
- Everything else → user's relays (low weight)

Returns `RelaysAndFilters[]` with optimized relay-filter combinations.
