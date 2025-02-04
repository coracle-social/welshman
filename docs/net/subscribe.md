# Subscribe

The Subscribe class manages nostr subscriptions, handling subscription lifecycle, event filtering, and relay responses. It provides a unified interface for subscribing to events across multiple relays.

## Overview

The Subscription:
- Manages REQ/CLOSE lifecycle
- Handles EOSE responses
- Emits filtered events
- Tracks completion state

```typescript
import {subscribe, SubscriptionEvent} from '@welshman/net'

// Create subscription
const sub = subscribe({
  filters: [{kinds: [1], limit: 10}],
  relays: ["wss://relay.example.com"],

  // Optional configurations
  closeOnEose: true,    // Close after all relays send EOSE
  timeout: 3000,        // Max time to wait
  authTimeout: 300,     // Time for auth negotiation
  delay: 50            // Delay between batched requests
})

// Handle events
sub.on(SubscriptionEvent.Event, (url, event) => {
  console.log(`Got event from ${url}:`, event)
})

sub.on(SubscriptionEvent.Eose, (url) => {
  console.log(`Got EOSE from ${url}`)
})

sub.on(SubscriptionEvent.Complete, () => {
  console.log('Subscription complete')
})

// Close when done
sub.close()
```

## Architecture

```typescript
import {subscribe, Pool, Executor, Relays} from '@welshman/net'

// Under the hood, subscribe:
// 1. Gets connections from global pool
// 2. Creates a target (usually Relays)
// 3. Uses Executor to manage subscription

// This is roughly equivalent to:
const manualSubscribe = (urls: string[]) => {
  // Get connections from pool
  const connections = urls.map(url =>
    ctx.net.pool.get(url)
  )

  // Create target
  const target = new Relays(connections)

  // Create executor
  const executor = new Executor(target)

  // Subscribe via executor
  return executor.subscribe(
    [{kinds: [1], limit: 10}],
    {
      onEvent: (url, event) => {
        console.log(`Got event from ${url}`)
      }
    }
  )
}
```

## Real World Example

```typescript
// Combine local and remote relays
const loadProfile = async (pubkey: string) => {
  // Get optimal relays
  const relays = ctx.app.router
    .ForPubkey(pubkey)
    .getUrls()

  const sub = subscribe({
    filters: [{
      kinds: [0],
      authors: [pubkey],
      limit: 1
    }],
    relays,
    // This creates internally:
    // 1. Connections via Pool
    // 2. Multi target with Local + Relays
    // 3. Executor to manage subscription
  })

  return new Promise(resolve => {
    sub.on('event', (url, event) => {
      resolve(event)
      sub.close()
    })
  })
}
```

The Subscribe class abstracts away:
- Connection management (via Pool)
- Target creation and setup
- Executor orchestration
