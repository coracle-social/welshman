# @welshman/relay

[![version](https://badgen.net/npm/v/@welshman/relay)](https://npmjs.com/package/@welshman/relay)

A few utilites for storing nostr events in memory.

## What's Included

- **Event Store** - A Repository class which stores events in memory
- **Relay Adapter** - A LocalRelay class which adapts nostr messages to the repository

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

## Installation

```bash
npm install @welshman/relay
```
