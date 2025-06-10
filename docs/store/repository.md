# Repository

Reactive Svelte stores for querying and mapping events from a Repository with automatic updates.

## Functions

### deriveEventsMapped(repository, options)

Creates a reactive store that maps events to custom items and keeps them synchronized with repository updates.

**Options:**
- `filters` - Array of Nostr filters to query events
- `eventToItem` - Function to transform events to items (can return Promise)
- `itemToEvent` - Function to extract the event from an item
- `throttle?` - Throttle updates (milliseconds, default: 0)
- `includeDeleted?` - Include deleted events (default: false)

### deriveEvents(repository, options)

Creates a reactive store of events without transformation.

**Options:**
- `filters` - Array of Nostr filters
- `throttle?` - Throttle updates
- `includeDeleted?` - Include deleted events

### deriveEvent(repository, idOrAddress)

Creates a reactive store for a single event by ID or address.

### deriveIsDeleted(repository, event)

Creates a reactive store that tracks whether an event is deleted.

### deriveIsDeletedByAddress(repository, event)

Creates a reactive store that tracks whether an event is deleted by address.

## Example

```typescript
import {Repository} from "@welshman/relay"
import {deriveEventsMapped, deriveEvents} from "@welshman/store"
import {readProfile, PROFILE} from "@welshman/util"

const repository = new Repository()

// Reactive store of text notes
const textNotes = deriveEvents(repository, {
  filters: [{kinds: [1], limit: 100}],
  throttle: 100
})

// Reactive store of profiles mapped to custom objects
const profiles = deriveEventsMapped(repository, {
  filters: [{kinds: [PROFILE]}],
  eventToItem: event => readProfile(event),
  itemToEvent: profile => profile.event,
  includeDeleted: false
})

// Subscribe to updates
textNotes.subscribe(notes => {
  console.log(`Found ${notes.length} text notes`)
})

profiles.subscribe(profiles => {
  console.log(`Found ${profiles.length} profiles`)
})

// Add some events to the repository
repository.publish(someTextNoteEvent)
repository.publish(someProfileEvent)
```