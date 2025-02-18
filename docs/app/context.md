# Application Context

The `@welshman/app` package uses a global context system to configure core behaviors.
Understanding the app context is essential as it powers [session/authentication](/app/session), [relay routing](/app/relay) and [request handling](/app/request).

## Basic Setup

```typescript
import {ctx, setContext} from '@welshman/lib'
import {getDefaultNetContext, getDefaultAppContext} from '@welshman/app'

// Initialize app with default settings
setContext({
  net: getDefaultNetContext(),
  app: getDefaultAppContext()
})

// Access context anywhere
console.log(ctx.app.router)
console.log(ctx.net.pool)
```

## Default App Context

```typescript
export type AppContext = {
  // Smart relay routing system
  router: Router

  // Time to wait between batched requests (ms)
  requestDelay: number // default: 50

  // Time to wait for NIP-42 relay auth (ms)
  authTimeout: number // default: 300

  // Time to wait for request completion (ms)
  requestTimeout: number // default: 3000

  // URL of metadata service (optional)
  dufflepudUrl?: string

  // Additional relays for indexed content
  indexerRelays?: string[]
}

// Example with custom settings
setContext({
  app: getDefaultAppContext({
    requestDelay: 100,
    authTimeout: 500,
    requestTimeout: 5000,
    dufflepudUrl: "https://api.example.com",
    indexerRelays: [
      "wss://relay.example.com",
      "wss://indexed.example.com"
    ]
  })
})
```

## Network Context

```typescript
export type NetContext = {
  // Global connection pool
  pool: Pool

  // How to handle NIP-42 auth
  authMode: AuthMode // default: 'implicit'

  // Event validation and handling
  onEvent: (url: string, event: TrustedEvent) => void
  isDeleted: (url: string, event: TrustedEvent) => boolean
  isValid: (url: string, event: TrustedEvent) => boolean

  // Event signing (used by all packages)
  signEvent: (event: StampedEvent) => Promise<SignedEvent>

  // Subscription optimization
  optimizeSubscriptions: (subs: Subscription[]) => RelaysAndFilters[]
}

// Example with custom validation
setContext({
  net: getDefaultNetContext({
    // Custom event validation
    isValid: (url, event) => {
      if (url === LOCAL_RELAY_URL) return true
      return hasValidSignature(event)
    },

    // Track deleted events
    isDeleted: (url, event) =>
      repository.isDeleted(event),

    // Custom event handling
    onEvent: (url, event) => {
      // Save to local repository
      repository.publish(event)

      // Track which relay it came from
      tracker.track(event.id, url)
    }
  })
})
```


## Using Context Values

Once configured, context values are used throughout the app:

```typescript
import {ctx} from '@welshman/lib'

// Smart relay routing
const relays = ctx.app.router
  .ForPubkey(pubkey)
  .getUrls()

// Publish with timeout
const pub = publish({
  event,
  relays,
  timeout: ctx.app.requestTimeout
})

// Subscribe with auth
const sub = subscribe({
  filters,
  relays,
  authTimeout: ctx.app.authTimeout
})

// Check connection pool
const connected = ctx.net.pool
  .get(relay)
  .socket.status === 'open'
```
