# Nostr Address

The Address module provides utilities for working with Nostr Addresses (NIP-19 naddr format) and handles the conversion between different address formats. Addresses are used to reference addressable events (kinds 10000-39999) in a format that includes kind, pubkey, and identifier.

## API

```typescript
// Address class for handling addressable events
export declare class Address {
  constructor(
    kind: number,
    pubkey: string,
    identifier: string,
    relays?: string[]
  );

  // Check if string is a valid address format
  static isAddress(address: string): boolean;

  // Parse address from string format "kind:pubkey:identifier"
  static from(address: string, relays?: string[]): Address;

  // Parse address from naddr (NIP-19 format)
  static fromNaddr(naddr: string): Address;

  // Create address from addressable event
  static fromEvent(event: AddressableEvent, relays?: string[]): Address;

  // Convert to string format "kind:pubkey:identifier"
  toString(): string;

  // Convert to naddr (NIP-19 format)
  toNaddr(): string;
}

// Utility function to get address string from event
export declare const getAddress: (e: AddressableEvent) => string;
```

## Examples

### Creating and parsing addresses

```typescript
import { Address } from '@welshman/util';

// Create address from components
const address = new Address(
  30023,
  '27067f0efd1b9ffc6d71672a1b69a4e5ac3b8ce3cc8428b06849448e38d69389',
  'my-article',
  ['wss://relay.example.com']
);

// Parse from string format
const parsed = Address.from('30023:27067f0efd1b9ffc6d71672a1b69a4e5ac3b8ce3cc8428b06849448e38d69389:my-article');
console.log(parsed.kind); // 30023
console.log(parsed.identifier); // 'my-article'

// Check if string is valid address
const isValid = Address.isAddress('30023:27067f0efd1b9ffc6d71672a1b69a4e5ac3b8ce3cc8428b06849448e38d69389:my-article'); // true
const isInvalid = Address.isAddress('invalid-format'); // false
```

### Converting between formats

```typescript
import { Address } from '@welshman/util';

const address = new Address(30023, '27067f0efd1b9ffc6d71672a1b69a4e5ac3b8ce3cc8428b06849448e38d69389', 'my-article');

// Convert to string format
const addressString = address.toString();
console.log(addressString); // '30023:27067f0efd1b9ffc6d71672a1b69a4e5ac3b8ce3cc8428b06849448e38d69389:my-article'

// Convert to naddr format (NIP-19)
const naddr = address.toNaddr();
console.log(naddr); // 'naddr1...'

// Parse back from naddr
const fromNaddr = Address.fromNaddr(naddr);
console.log(fromNaddr.kind); // 30023
```

### Working with events

```typescript
import { Address, getAddress } from '@welshman/util';

const event = {
  kind: 30023,
  pubkey: '27067f0efd1b9ffc6d71672a1b69a4e5ac3b8ce3cc8428b06849448e38d69389',
  tags: [
    ['d', 'my-article'],
    ['title', 'My Article Title']
  ]
};

// Create address from event
const address = Address.fromEvent(event, ['wss://relay.example.com']);
console.log(address.identifier); // 'my-article'

// Get address string directly
const addressString = getAddress(event);
console.log(addressString); // '30023:27067f0efd1b9ffc6d71672a1b69a4e5ac3b8ce3cc8428b06849448e38d69389:my-article'
```
