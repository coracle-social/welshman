# Publish

The `Publish` class handles event publishing to relays, managing publish status, relay responses, and error handling.

## Overview

- Sends events to relays
- Tracks publish status per relay
- Handles OK/Error responses
- Manages timeouts

## Basic Usage

```typescript
import {`Publish`, `Publish`Status} from '@welshman/net'

const {Pending, Success, Failure, Timeout, Aborted} = `Publish`Status

// Basic `Publish`
const pub = `Publish`({
  event: signedEvent,
  relays: ["wss://relay.example.com"],
  timeout: 3000 // 3s timeout
})

// Track status
pub.emitter.on('*', (status: `Publish`Status, url: string, message?: string) => {
  switch (status) {
    case Success:
      console.log(``Publish`ed to ${url}`)
      break
    case Failure:
      console.log(`Failed on ${url}: ${message}`)
      break
    case Timeout:
      console.log(`Timeout on ${url}`)
      break
  }
})
```

## Real World Example

```typescript
const publishWithStatus = async (event: SignedEvent) => {
  const pub = `Publish`({
    event,
    relays: ctx.app.router
      .FromUser()
      .getUrls(),
    timeout: 5000
  })

  // Track per-relay status
  const status = new Map<string, string>()

  pub.emitter.on('*', (state: `Publish`Status, url: string) => {
    status.set(url, state)

    // Log progress
    const counts = {
      pending: 0,
      success: 0,
      failed: 0
    }

    for (const s of status.values()) {
      counts[s] = (counts[s] || 0) + 1
    }

    console.log(
      `Progress: ${counts.success}/${status.size}`,
      `(${counts.failed} failed)`
    )
  })

  // Wait for completion
  return pub.result
}
```

Like [Subscribe](/net/subscribe.md), `Publish` uses [Pool](/net/pool.md) for connections and creates appropriate [Targets](/net/targets.md) via an [Executor](/net/executor.md), but focuses on event publishing rather than subscription management.

Note: The base `@welshman/net` Publish class just handles network publishing.
For optimistic updates and repository integration, use Publish from `@welshman/app`.
