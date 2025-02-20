# Event-Based Stores

## deriveEventsMapped
Creates a store that maintains a mapped collection of events from a repository.
Useful when you want to transform events into a different data structure while maintaining reactivity.

```typescript
import {Repository, NAMED_PEOPLE, type TrustedEvent} from '@welshman/util'
import {deriveEventsMapped} from '@welshman/store'

interface UserProfile {
  name: string;
  about: string;
  pubkey: string;
}

const repository = new Repository()

const profiles = deriveEventsMapped<UserProfile>(repository, {
  filters: [{kinds: [PROFILE]}],
  eventToItem: (event: TrustedEvent) => ({
    name: event.content.name,
    about: event.content.about,
    pubkey: event.pubkey,
  }),
  itemToEvent: (profile: UserProfile) => ({
    // Convert profile back to event format
    kind: PROFILE,
    pubkey: profile.pubkey,
    content: {
      name: profile.name,
      about: profile.about,
    }
  }),
  throttle: 1000, // Optional: throttle updates
  includeDeleted: false // Optional: exclude deleted events
})
```

## deriveEvents
Creates a store that maintains a collection of raw events from a repository.
Useful when you want to work directly with events without transformation.

```typescript
import {Repository} from '@welshman/util'
import {deriveEvents} from '@welshman/store'

const repository = new Repository()

const textNotes = deriveEvents(repository, {
  filters: [{kinds: [NOTE], // kind 1 = text note
  authors: ['pubkey1', 'pubkey2']}],
  throttle: 500,
  includeDeleted: false
})

// Subscribe to changes
textNotes.subscribe(events => {
  console.log('New text notes:', events)
})
```

## deriveEvent
Creates a store that tracks a single event by its ID or address.
Returns a derived store containing the event or undefined.

```typescript
import {Repository} from '@welshman/util'
import {deriveEvent} from '@welshman/store'

const repository = new Repository()

const specificEvent = deriveEvent(repository, 'event_id_or_address')

// Subscribe to changes of the specific event
specificEvent.subscribe(event => {
  if (event) {
    console.log('Event updated:', event)
  } else {
    console.log('Event not found')
  }
})
```

## deriveIsDeleted
Creates a store that tracks whether an event has been deleted. Returns a boolean store.

```typescript
import {Repository} from '@welshman/util'
import {deriveIsDeleted} from '@welshman/store'

const repository = new Repository()
const event = /* your event */

const isDeleted = deriveIsDeleted(repository, event)

// Subscribe to deletion status changes
isDeleted.subscribe(deleted => {
  console.log('Event deleted status:', deleted)
})
```

## deriveIsDeletedByAddress
Creates a store that tracks whether an event has been deleted by address.
Similar to deriveIsDeleted but checks deletion by address instead of event ID.

```typescript
import {Repository} from '@welshman/util'
import {deriveIsDeletedByAddress} from '@welshman/store'

const repository = new Repository()
const event = /* your event */

const isDeletedByAddress = deriveIsDeletedByAddress(repository, event)

// Subscribe to address-based deletion status changes
isDeletedByAddress.subscribe(deleted => {
  if (deleted) {
    console.log('Event has been deleted by address')
  }
})
```
