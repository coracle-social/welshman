# Context

The Context system is the backbone of `@welshman/net`, providing global configuration and shared services that are essential for the package's operation. It defines how events are handled, validated, and routed throughout the application.

## Overview

- Global connection pool (`ctx.net.pool`)
- Event validation (`ctx.net.isValid`)
- Event handling (`ctx.net.onEvent`)
- Deletion tracking (`ctx.net.isDeleted`)
- Event signing (`ctx.net.signEvent`)
- Subscription optimization (`ctx.net.optimizeSubscriptions`)

## Basic Usage

```typescript
import {ctx, setContext} from '@welshman/lib'
import {
  getDefaultNetContext,
  Pool,
  hasValidSignature
} from '@welshman/net'

// Setup networking context
setContext({
  net: getDefaultNetContext({
    // Use shared pool
    pool: new Pool(),

    // Track events
    onEvent: (url, event) => {
      tracker.track(event.id, url)
      repository.publish(event)
    },

    // Validate based on source
    isValid: (url, event) => {
      // Trust local relay
      if (url === LOCAL_RELAY_URL) return true

      // Validate signature for remote events
      return hasValidSignature(event)
    },

    // Check deletion status
    isDeleted: (url, event) =>
      repository.isDeleted(event),

    // Sign with current user
    signEvent: async (event) =>
      signer.get().sign(event)
  })
})

// Now all package features will use these settings
subscribe(/*...*/)   // Uses pool, validates events
publish(/*...*/)    // Uses signEvent
```

The Context is used internally by most features in the package.
Without proper context configuration, core features like subscription, publishing, and event validation won't work correctly.

Think of it as the central configuration that defines how your nostr networking behaves.
