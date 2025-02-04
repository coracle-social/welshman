# Executor

The Executor class orchestrates event delivery and subscription management across one or more [targets](/net/targets.md). It abstracts the complexity of handling multiple connections into a single interface.

## Overview

The Executor:
- Manages subscriptions
- Handles event publishing
- Supports NIP-77 (negentropy)
- Routes messages to appropriate targets

## Basic Usage

```typescript
import {Executor, Relays} from '@welshman/net'

// Create executor with relay target
const executor = new Executor(
  new Relays([
    connection1,
    connection2
  ])
)

// Subscribe to events
const sub = executor.subscribe(
  [{kinds: [1], limit: 10}],
  {
    onEvent: (url, event) => {
      console.log(`Got event from ${url}`, event)
    },
    onEose: (url) => {
      console.log(`EOSE from ${url}`)
    }
  }
)

// Publish event
const pub = executor.publish(
  signedEvent,
  {
    onOk: (url, id, success, message) => {
      console.log(`Published to ${url}: ${success ? 'OK' : message}`)
    }
  }
)

// Clean up
sub.unsubscribe()
executor.target.cleanup()
```

The Executor is used internally by higher-level APIs but can be used directly when you need fine-grained control over event routing and subscription management.

It's particularly useful when implementing custom targets or handling special relay configurations (like local relays or relay groups).
