# Tracker

Event tracker for managing which events have been seen from which relays, used for deduplication across multiple relay connections.

## Classes

### Tracker

Tracks the relationship between event IDs and relay URLs to prevent duplicate processing.

**Properties:**
- `relaysById` - Map of event IDs to sets of relay URLs
- `idsByRelay` - Map of relay URLs to sets of event IDs

**Methods:**
- `getIds(relay)` - Gets all event IDs seen from a relay
- `getRelays(eventId)` - Gets all relays that have sent an event
- `hasRelay(eventId, relay)` - Checks if an event was seen from a relay
- `addRelay(eventId, relay)` - Records that an event was seen from a relay
- `removeRelay(eventId, relay)` - Removes the event-relay association
- `track(eventId, relay)` - Tracks an event and returns true if already seen
- `copy(eventId1, eventId2)` - Copies relay associations from one event to another
- `load(relaysById)` - Loads tracker state from a map
- `clear()` - Clears all tracked data

**Events:**
- `add` - Emitted when event-relay association is added
- `remove` - Emitted when event-relay association is removed
- `load` - Emitted when tracker state is loaded
- `clear` - Emitted when tracker is cleared

## Example

```typescript
import {Tracker} from "@welshman/net"

const tracker = new Tracker()

// Track events from different relays
const isDuplicate1 = tracker.track("event123", "wss://relay1.com") // false
const isDuplicate2 = tracker.track("event123", "wss://relay2.com") // false
const isDuplicate3 = tracker.track("event123", "wss://relay1.com") // true (duplicate)

// Check which relays have sent an event
const relays = tracker.getRelays("event123") // Set(["wss://relay1.com", "wss://relay2.com"])
```

If you're not using `@welshman/app`, you might want to track relays for all events that come through:

```typescript
import {Pool, Tracker, SocketEvent, isRelayEvent} from "@welshman/net"
import {isEphemeralKind, isDVMKind, verifyEvent} from "@welshman/util"
import {Repository} from "@welshman/relay"

const tracker = new Tracker()
const repository = new Repository()

Pool.get().subscribe(socket => {
  socket.on(SocketEvent.Receive, message => {
    if (isRelayEvent(message)) {
      const event = message[2]

      if (!isEphemeralKind(event.kind) && !isDVMKind(event.kind) && verifyEvent(event)) {
        tracker.track(event.id, socket.url)
        repository.publish(event)
      }
    }
  })
})
```
