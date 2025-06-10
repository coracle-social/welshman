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
