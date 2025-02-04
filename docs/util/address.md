# Nostr Address

The Address module provides utilities for working with Nostr Addresses (NIP-19 naddr format) and handles the conversion between different address formats.

## Address Class

```typescript
class Address {
  constructor(
    readonly kind: number,      // Event kind
    readonly pubkey: string,    // Author's public key
    readonly identifier: string, // Unique identifier (d-tag)
    readonly relays?: string[], // Optional relay hints
  )
}
```

## Creating Addresses

### From Components
```typescript
const address = new Address(
  30023,                      // kind (e.g., long-form article)
  'ab82...123',              // pubkey
  'my-article-title',        // identifier
  ['wss://relay.example.com'] // relays
)
```

### From String Format
```typescript
// Parse "kind:pubkey:identifier" format
const address = Address.from('30023:ab82...123:my-article-title')

// With optional relays
const address = Address.from(
  '30023:ab82...123:my-article-title',
  ['wss://relay.example.com']
)
```

### From Naddr
```typescript
// Parse naddr format
const address = Address.fromNaddr('naddr1...')
```

### From Event
```typescript
const address = Address.fromEvent(event, relays)
```

## Converting Addresses

### To String
```typescript
const address = new Address(kind, pubkey, identifier)
address.toString() // => "kind:pubkey:identifier"
```

### To Naddr
```typescript
const address = new Address(kind, pubkey, identifier, relays)
address.toNaddr() // => "naddr1..."
```

## Utility Functions

### Check Address Format
```typescript
// Check if string is valid address format
Address.isAddress('30023:abc...123:title') // => true
Address.isAddress('not-an-address') // => false
```

### Get Address from Event
```typescript
import { getAddress } from '@welshman/util'

// Extract address from event
const address = getAddress(event)
```

## Examples

### Working with Long-form Content
```typescript
// Create address for article
const articleAddress = new Address(
  30023,               // Long-form content kind
  authorPubkey,
  'my-article-slug',
  ['wss://relay.example.com']
)

// Convert to string format for storage
const addressString = articleAddress.toString()

// Convert to naddr for sharing
const shareableAddress = articleAddress.toNaddr()
```

### Handling Replaceable Events
```typescript
// Create address from replaceable event
const address = Address.fromEvent(event)

// Store latest version using address as key
storage.set(address.toString(), event)
```
