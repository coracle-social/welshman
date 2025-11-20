# Making Requests

Welshman extends Nostr's base subscription model with intelligent caching, repository integration, and configurable behaviors.

## Key Concepts

- **Local Repository**: Events are automatically cached and tracked
- **Cache Intelligence**: Smart decisions about when to use cached data
- **Relay Integration**: Works with the router for optimal relay selection
- **Configurable Behavior**: Control caching and timeouts

## Request and Load

The base functionality for subscription management is implemented in `@welshman/net`. Please refer to [the documentation](/net) for that module for details.

## Indexed Collections and Loaders

Create indexed stores with automatic loading using repository derivations and loader utilities:

```typescript
import {deriveItemsByKey, deriveItems, makeDeriveItem, makeLoadItem, getter} from "@welshman/store"

// Create indexed map from repository
const itemsByKey = deriveItemsByKey({
  repository,
  filters: [{kinds: [SOME_KIND]}],
  eventToItem: event => transformEvent(event),
  getKey: item => item.id
})

// Create array view
const items = deriveItems(itemsByKey)

// Create getter for accessing map
const getItemsByKey = getter(itemsByKey)

// Create loader
const loadItem = makeLoadItem(fetchItem, key => getItemsByKey().get(key))

// Create deriver with automatic loading
const deriveItem = makeDeriveItem(itemsByKey, loadItem)
```

### Deriving Events

Query events from the repository using `deriveEventsById` and `deriveEvents`:

```typescript
import {deriveEventsById, deriveEvents} from "@welshman/store"

const noteEventsById = deriveEventsById({repository, filters: [{kinds: [NOTE]}]})
export const notes = deriveEvents(noteEventsById)
```

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
relayLists → relayListsByPubkey → deriveRelayLists → loadRelayLists
messagingRelayLists → messagingRelayListsByPubkey → deriveMessagingRelayLists → loadMessagingRelayLists

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
