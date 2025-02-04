# Tracker

The Tracker is a simple but crucial class that keeps track of which relays an event was seen on or published to. It's essential for relay selection and event source tracking.

## Overview

```typescript
import {Tracker} from '@welshman/net'

const tracker = new Tracker()

// Track event source
tracker.track(eventId, relayUrl)

// Get relays for event
const relays = tracker.getRelays(eventId)  // Set<string>

// Get events from relay
const events = tracker.getIds(relayUrl)    // Set<string>

// Check specific relay
const seen = tracker.hasRelay(eventId, relayUrl)
```

## Used By

1. **Repository & Sync**
```typescript
// In sync operations
pull({
  events,
  relays,
  onEvent: (event) => {
    tracker.track(event.id, relay)
  }
})
```

2. **Subscribe**
```typescript
// In @welshman/app subscribe
sub.on('event', (url, event) => {
  // Track where we got the event
  tracker.track(event.id, url)
})
```

3. **Publish**
```typescript
// In publish operations
pub.emitter.on('success', (url) => {
  // Track where we published
  tracker.track(event.id, url)
})
```

4. **Router**
```typescript
// Used for relay selection
const relays = tracker
  .getRelays(event.id)
  .filter(url =>
    isHealthyRelay(url)
  )
```

The Tracker:
- Maps events to their source relays
- Maps relays to their known events
- Helps optimize relay selection

Think of it as a memory of where events came from, helping make better decisions about where to find or publish events.
