# Relay

The `Relay` module provides utilities for working with Nostr relays, including URL normalization, validation, and relay profile handling.

## API

### Types and Enums

```typescript
// Relay operation modes
export enum RelayMode {
  Read = "read",
  Write = "write",
  Inbox = "inbox"
}

// Relay information from NIP-11
export type RelayProfile = {
  url: string;
  icon?: string;
  banner?: string;
  name?: string;
  pubkey?: string;
  contact?: string;
  software?: string;
  version?: string;
  negentropy?: number;
  description?: string;
  supported_nips?: number[];
  limitation?: {
    min_pow_difficulty?: number;
    payment_required?: boolean;
    auth_required?: boolean;
  };
};
```

### URL Validation

```typescript
// Check if URL is a valid relay URL
export declare const isRelayUrl: (url: string) => boolean;

// Check if URL is an onion (Tor) address
export declare const isOnionUrl: (url: string) => boolean;

// Check if URL is a local address
export declare const isLocalUrl: (url: string) => boolean;

// Check if URL contains an IP address
export declare const isIPAddress: (url: string) => boolean;

// Check if URL is safe to share publicly
export declare const isShareableRelayUrl: (url: string) => boolean;
```

### URL Normalization

```typescript
// Normalize relay URL to standard format
export declare const normalizeRelayUrl: (url: string) => string;

// Format URL for display (remove protocol, trailing slash)
export declare const displayRelayUrl: (url: string) => string;
```

### Relay Profile

```typescript
// Get display name for relay profile
export declare const displayRelayProfile: (profile?: RelayProfile, fallback?: string) => string;
```

## Examples

### URL Validation

```typescript
import {
  isRelayUrl,
  isOnionUrl,
  isLocalUrl,
  isShareableRelayUrl
} from '@welshman/util';

// Valid relay URLs
console.log(isRelayUrl('wss://relay.damus.io')); // true
console.log(isRelayUrl('relay.damus.io')); // true (auto-adds wss://)
console.log(isRelayUrl('ws://localhost:8080')); // true

// Invalid URLs
console.log(isRelayUrl('https://example.com')); // false (not websocket)
console.log(isRelayUrl('invalid-url')); // false

// Special URL types
console.log(isOnionUrl('wss://7rqsrjfmyb3n2k72.onion')); // true
console.log(isLocalUrl('ws://localhost:8080')); // true
console.log(isLocalUrl('wss://relay.local')); // true

// Safe to share publicly
console.log(isShareableRelayUrl('wss://relay.damus.io')); // true
console.log(isShareableRelayUrl('ws://localhost:8080')); // false (local)
```

### URL Normalization

```typescript
import { normalizeRelayUrl, displayRelayUrl } from '@welshman/util';

// Normalize various URL formats
console.log(normalizeRelayUrl('relay.damus.io'));
// 'wss://relay.damus.io/'

console.log(normalizeRelayUrl('ws://RELAY.EXAMPLE.COM/path'));
// 'ws://relay.example.com/path'

console.log(normalizeRelayUrl('wss://relay.damus.io/?ref=123'));
// 'wss://relay.damus.io/' (strips query params)

// Format for display
console.log(displayRelayUrl('wss://relay.damus.io/'));
// 'relay.damus.io'

console.log(displayRelayUrl('ws://localhost:8080/'));
// 'localhost:8080'
```

### Working with Relay Profiles

```typescript
import { displayRelayProfile, RelayProfile } from '@welshman/util';

const relayProfile: RelayProfile = {
  url: 'wss://relay.damus.io',
  name: 'Damus Relay',
  description: 'A high-performance Nostr relay',
  software: 'strfry',
  version: '1.0.0',
  supported_nips: [1, 2, 4, 9, 11, 12, 15, 16, 20, 22],
  limitation: {
    payment_required: false,
    auth_required: false,
    min_pow_difficulty: 0
  }
};

// Get display name
const displayName = displayRelayProfile(relayProfile);
console.log(displayName); // 'Damus Relay'

// With fallback for unnamed relays
const anonymousRelay: RelayProfile = {
  url: 'wss://anonymous.relay.com'
};

const name = displayRelayProfile(anonymousRelay, 'Unknown Relay');
console.log(name); // 'Unknown Relay'
```
