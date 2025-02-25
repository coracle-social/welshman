# Relay

The `Relay` module provides utilities for working with Nostr relays, including a local in-memory relay implementation that integrates with [Repository](/util/repository) for event storage.
The Relay class extends EventEmitter to provide event-based communication.

## Core Components

### Relay Class
```typescript
class Relay<E extends HashedEvent = TrustedEvent> extends Emitter {
  constructor(readonly repository: Repository<E>)

  // Emit events: 'EVENT', 'EOSE', 'OK'
  emit(type: string, ...args: any[]): boolean

  // Handle relay messages
  send(type: string, ...message: any[]): void
}
```

### Relay Profile
```typescript
interface RelayProfile {
  url: string              // Relay URL
  name?: string           // Display name
  description?: string    // Description
  pubkey?: string        // Operator's pubkey
  contact?: string       // Contact information
  software?: string      // Software name
  version?: string       // Software version
  supported_nips?: number[] // Supported NIPs
  limitation?: {
    min_pow_difficulty?: number
    payment_required?: boolean
    auth_required?: boolean
  }
}
```

### Finding Relay Information

```typescript
// Fetch relay information document
async function getRelayProfile(url: string): Promise<RelayProfile | null> {
  try {
    const normalized = normalizeRelayUrl(url)
    // Convert ws/wss to http/https
    const httpUrl = normalized.replace(/^ws(s)?:\/\//, 'http$1://')

    // Fetch relay information document
    const response = await fetch(`${httpUrl}`)
    const info = await response.json()

    return {
      url: normalized,
      name: info.name,
      description: info.description,
      pubkey: info.pubkey,
      contact: info.contact,
      software: info.software,
      version: info.version,
      supported_nips: info.supported_nips,
      limitation: info.limitation
    }
  } catch (error) {
    console.error(`Failed to fetch relay info for ${url}:`, error)
    return null
  }
}
```

## URL Utilities

### URL Validation
```typescript
// Check if URL is valid relay URL
isRelayUrl(url: string): boolean

// Check if URL is .onion address
isOnionUrl(url: string): boolean

// Check if URL is local
isLocalUrl(url: string): boolean

// Check if URL is IP address
isIPAddress(url: string): boolean

// Check if URL can be shared
isShareableRelayUrl(url: string): boolean
```

### URL Formatting
```typescript
// Normalize relay URL
normalizeRelayUrl(url: string): string

// Format URL for display
displayRelayUrl(url: string): string

// Format relay profile for display
displayRelayProfile(profile?: RelayProfile, fallback = ""): string
```


## Usage Examples

### URL Processing
```typescript
// Validate relay URL
if (isRelayUrl(url)) {
  // Normalize for consistency
  const normalized = normalizeRelayUrl(url)

  // Check if shareable
  if (isShareableRelayUrl(normalized)) {
    // Format for display
    const display = displayRelayUrl(normalized)
    showRelay(display)
  }
}
```

### Relay usage with Repository

```typescript
// Create storage and relay interface
const repository = new Repository()
const relay = new Relay(repository)

// Subscribe to events
relay.send("REQ", "sub_id", {
  kinds: [1],
  limit: 100
})

// Listen for events
relay.on("EVENT", (subId, event) => {
  console.log(`Received event for ${subId}:`, event)
})

// Publish event
// Will be stored in repository and sent to matching subscribers
relay.send("EVENT", signedEvent)

// Close subscription
relay.send("CLOSE", "sub_id")
```
