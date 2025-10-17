# @welshman/relay

[![version](https://badgen.net/npm/v/@welshman/relay)](https://npmjs.com/package/@welshman/relay)

A few utilites for storing nostr events in memory.

## What's Included

- **Event Store** - A Repository class which stores events in memory
- **Relay Adapter** - A LocalRelay class which adapts nostr messages to the repository
- **Event Tracker** - A Tracker class for managing which events have been seen from which relays
- **Gift Wrap Manager** - A WrapManager class for tracking and unwrapping NIP-59 gift wrapped events

## Quick Example

```typescript
import {Repository, LocalRelay} from "@welshman/relay"

// Create an in-memory event repository
const repository = Repository.get()

// Publish events directly to the repository
const textNote = {
  id: "event123",
  pubkey: "author-pubkey",
  created_at: Math.floor(Date.now() / 1000),
  kind: 1,
  tags: [],
  content: "Hello, world!",
  sig: "signature"
}

repository.publish(textNote)

// Query events using filters
const recentNotes = repository.query([{kinds: [1], limit: 10}])
console.log(`Found ${recentNotes.length} text notes`)

// Listen for repository updates
repository.on("update", ({added, removed}) => {
  console.log(`Added ${added.length} events, removed ${removed.size} events`)
})

// Create a local relay that adapts Nostr messages to the repository
const relay = new LocalRelay(repository)

// Listen for relay messages
relay.on("EVENT", (subId, event) => {
  console.log(`Received event ${event.id} for subscription ${subId}`)
})

relay.on("OK", (eventId, success, message) => {
  console.log(`Event ${eventId} ${success ? "accepted" : "rejected"}: ${message}`)
})

// Use relay protocol to publish and subscribe
relay.send("EVENT", {
  id: "event456",
  pubkey: "another-author",
  created_at: Math.floor(Date.now() / 1000),
  kind: 1,
  tags: [["t", "welshman"]],
  content: "Using LocalRelay!",
  sig: "signature"
})

// Subscribe to events with hashtag
relay.send("REQ", "tagged", {kinds: [1], "#t": ["welshman"]})
```

### Tracking Events Across Relays

```typescript
import {Tracker} from "@welshman/relay"

const tracker = new Tracker()

// Track events from different relays
const isDuplicate1 = tracker.track("event123", "wss://relay1.com") // false
const isDuplicate2 = tracker.track("event123", "wss://relay2.com") // false
const isDuplicate3 = tracker.track("event123", "wss://relay1.com") // true (duplicate)

// Check which relays have sent an event
const relays = tracker.getRelays("event123") // Set(["wss://relay1.com", "wss://relay2.com"])

// Copy relay tracking from one event to another (useful for wrapped events)
tracker.copy("wrap-event-id", "rumor-event-id")
```

### Managing Gift Wrapped Events

The WrapManager handles NIP-59 gift wrapped events, automatically unwrapping incoming wrapped events and tracking the relationship between wraps and their inner rumors.

```typescript
import {Repository, LocalRelay, Tracker, WrapManager} from "@welshman/relay"
import {ISigner} from "@welshman/signer"

const repository = Repository.get()
const relay = new LocalRelay(repository)
const tracker = new Tracker()

// Create a wrap manager with a function to get signers for different pubkeys
const wrapManager = new WrapManager({
  relay,
  tracker,
  getSigner: (pubkey: string) => {
    // Return the appropriate signer for this pubkey
    return mySignerMap.get(pubkey)
  }
})

// When you publish a wrapped event, track it
wrapManager.add({
  recipient: recipientPubkey,
  wrap: wrappedEvent,
  rumor: innerEvent
})

// When you receive a wrapped event, unwrap it
await wrapManager.unwrap(receivedWrapEvent)

// The rumor will be automatically published to the repository
// and relay tracking will be copied from the wrap to the rumor

// Remove wraps by various criteria
wrapManager.remove(wrapId)
wrapManager.removeByRumorId(rumorId)

// Listen for wrap manager events
wrapManager.on("add", (wrapItem) => {
  console.log("Wrap added:", wrapItem)
})

wrapManager.on("remove", (wrapItem) => {
  console.log("Wrap removed:", wrapItem)
})
```

## Installation

```bash
npm install @welshman/relay
```
