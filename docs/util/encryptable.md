# Encryptable

The Encryptable module provides utilities for handling encrypted Nostr events, allowing you to merge plaintext updates into events and encrypt them before publishing.

## API

```typescript
// Encryption function type
export type Encrypt = (x: string) => Promise<string>;

// Partial event content for updates
export type EncryptableUpdates = Partial<EventContent>;

// Event with attached plaintext data
export type DecryptedEvent = TrustedEvent & {
  plaintext: EncryptableUpdates;
};

// Creates a DecryptedEvent by attaching plaintext to an event
export declare const asDecryptedEvent: (
  event: TrustedEvent,
  plaintext?: EncryptableUpdates
) => DecryptedEvent;

// Encryptable class for handling encrypted events
export declare class Encryptable<T extends EventTemplate> {
  constructor(
    event: Partial<T>,
    updates: EncryptableUpdates
  );

  // Encrypts updates and merges them into the event
  reconcile(encrypt: Encrypt): Promise<T>;
}
```

## Examples

### Basic Usage

```typescript
import { Encryptable } from '@welshman/util';

// Create encryptable with plaintext updates
const encryptable = new Encryptable(
  { kind: 10000 }, // Base event template
  { content: "secret mute list data" } // Plaintext content to encrypt
);

// Encrypt and get final event
const encryptFn = async (text: string) => {
  // Your encryption logic here
  return await encrypt(text);
};

const event = await encryptable.reconcile(encryptFn);
// event.content is now encrypted
```

### Encrypting Tags

```typescript
import { Encryptable } from '@welshman/util';

// Encrypt both content and tag values
const encryptable = new Encryptable(
  { kind: 10000, tags: [] },
  {
    content: JSON.stringify(['pubkey1', 'pubkey2']),
    tags: [['p', 'sensitive-pubkey'], ['e', 'sensitive-event-id']]
  }
);

// The reconcile method encrypts tag values at index 1
const event = await encryptable.reconcile(encryptFn);
// event.tags[0] = ['p', 'encrypted-pubkey']
// event.tags[1] = ['e', 'encrypted-event-id']
```

### Working with Decrypted Events

```typescript
import { asDecryptedEvent } from '@welshman/util';

// Add plaintext data to an event for reference
const event = { kind: 10000, content: "encrypted...", tags: [] };
const plaintext = { content: "original content", tags: [['p', 'pubkey']] };

const decryptedEvent = asDecryptedEvent(event, plaintext);
console.log(decryptedEvent.plaintext.content); // "original content"
```
