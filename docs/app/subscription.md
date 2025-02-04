# Subscription System

The subscription system extends Nostr's base subscription model with intelligent caching, repository integration, and configurable behaviors.

## Key Concepts

- **Local Repository**: Events are automatically cached and tracked
- **Cache Intelligence**: Smart decisions about when to use cached data
- **Relay Integration**: Works with the router for optimal relay selection
- **Configurable Behavior**: Control caching and timeouts

## Configuration Options

```typescript
type SubscribeRequest = {
  // Required
  filters: Filter[]              // What to query

  // Behavior Control
  closeOnEose?: boolean         // Auto-close and use cache
  timeout?: number             // Max time to wait
  authTimeout?: number        // Time for auth negotiation
  requestDelay?: number      // Delay between batched requests

  // Optional
  relays?: string[]         // Specific relays to query

  // Event Handlers
  onEvent?: (event: TrustedEvent) => void
  onEose?: (url: string) => void
  onComplete?: () => void
}
```

## Cache Behavior Control

The `closeOnEose` parameter is crucial for controlling caching behavior:

```typescript
// WITH closeOnEose: true (default for load())
// - Checks cache first
// - Returns cached results if complete
// - Closes after EOSE
// - Good for: Known events, historical data
const loadKnownEvent = async (id: string) => {
  const events = await load({
    filters: [{ids: [id]}],
    closeOnEose: true
  })
  return events[0]
}

// WITH closeOnEose: false
// - Always queries relays
// - Stays open for updates
// - Ignores cache completeness
// - Good for: Replaceable events, live data
const watchProfile = (pubkey: string) => {
  return subscribe({
    filters: [{
      kinds: [PROFILE],
      authors: [pubkey]
    }],
    closeOnEose: false // Force relay query
  })
}
```

## Common Usage Patterns

### One-time Queries

```typescript
// Load specific event
const event = await load({
  filters: [{ids: [eventId]}]
  // closeOnEose: true by default
})

// Load latest profile
const profile = await load({
  filters: [{
    kinds: [PROFILE],
    authors: [pubkey],
    limit: 1
  }],
  closeOnEose: false // Get latest from network
})
```

### Live Subscriptions

```typescript
// Watch for updates
const sub = subscribe({
  filters: [{
    kinds: [NOTE],
    since: now() // Only new events
  }],
  closeOnEose: false, // Stay open
})

sub.on('event', (url, event) => {
  // Handle live events
})
```

### Smart Caching

```typescript
// Profile loader with refresh control
const loadProfile = async (pubkey: string, options = {}) => {
  const {
    forceRefresh = false,    // Skip cache
    timeout = 3000,         // Max wait time
    relays = []           // Optional relay override
  } = options

  // Get optimal relays if not specified
  const targetRelays = relays.length > 0
    ? relays
    : ctx.app.router.ForPubkey(pubkey).getUrls()

  return new Promise((resolve) => {
    const sub = subscribe({
      filters: [{
        kinds: [PROFILE],
        authors: [pubkey],
        limit: 1
      }],
      relays: targetRelays,
      closeOnEose: !forceRefresh, // Control cache behavior
      timeout,

      onEvent: (url, event) => {
        resolve(event)
        sub.close()
      },

      onComplete: () => resolve(null)
    })
  })
}
```

## Repository Integration

All events from subscriptions are automatically:
- Saved to the repository
- Tracked to their source relay
- Checked against deletion status

The repository serves as an intelligent cache layer, making subsequent queries for the same data faster.
