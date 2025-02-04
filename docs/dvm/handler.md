# DVM (Data Vending Machine) Handler

The DVM Handler module provides a framework for creating and managing Data Vending Machines in the Nostr ecosystem.
A DVM is a service that listens for specific kinds of events and responds with processed data.

## Core Concepts

### DVM Handler
```typescript
type DVMHandler = {
  stop?: () => void
  handleEvent: (e: TrustedEvent) => AsyncGenerator<StampedEvent>
}
```
A handler defines how to process specific kinds of events and generate responses.

### DVM Options
```typescript
type DVMOpts = {
  sk: string              // Private key for signing responses
  relays: string[]        // Relays to connect to
  handlers: Record<string, CreateDVMHandler>  // Event handlers by kind
  expireAfter?: number    // Response expiration time in seconds
  requireMention?: boolean // Require DVM to be mentioned in event
}
```

## Creating a DVM

```typescript
import { DVM } from '@welshman/dvm'

// Create handlers for different event kinds
const handlers = {
  // Handler for kind 5001
  "5001": (dvm: DVM) => ({
    handleEvent: async function*(event: TrustedEvent) {
      // Process event and yield responses
      yield {
        kind: 6001,
        content: "Processed result",
        created_at: now(),
        tags: []
      }
    }
  })
}

// Initialize DVM
const dvm = new DVM({
  sk: "your-private-key",
  relays: ["wss://relay.example.com"],
  handlers,
  expireAfter: 3600, // 1 hour
  requireMention: true
})

// Start the DVM
await dvm.start()
```


## Example Implementation

```typescript
import { DVM, CreateDVMHandler } from '@welshman/dvm'
import { now } from '@welshman/lib'

// Create a search handler
const createSearchHandler: CreateDVMHandler = (dvm) => ({
  handleEvent: async function*(event) {
    const query = event.content
    const results = await performSearch(query)

    yield {
      kind: 6001,
      content: JSON.stringify(results),
      created_at: now(),
      tags: [
        ["search", query],
        ["results", String(results.length)]
      ]
    }
  }
})

// Initialize DVM
const searchDVM = new DVM({
  sk: process.env.DVM_KEY!,
  relays: ["wss://relay1.com", "wss://relay2.com"],
  handlers: {
    "5001": createSearchHandler
  },
  expireAfter: 24 * 60 * 60, // 24 hours
  requireMention: true
})

// Start DVM
await searchDVM.start()

// Stop DVM when needed
process.on('SIGINT', () => {
  searchDVM.stop()
})
```

The DVM Handler provides a robust foundation for building Nostr data services, with built-in support for common requirements like deduplication, response signing, and metadata management.
