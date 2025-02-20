# NIP-59 (Gift Wrap) Implementation

The `Nip59` class provides utilities for implementing the Gift Wrap protocol (NIP-59), allowing secure event wrapping and unwrapping. This implementation works with any signer that supports encryption, making it versatile for different authentication methods.

## Key Features

- Event wrapping (encryption) for specific recipients
- Event unwrapping (decryption) of received wrapped events
- Automatic ephemeral wrapper generation
- Caching of previously unwrapped events
- Compatible with all signer implementations

## Basic Usage

```typescript
import { Nip59 } from '@welshman/signer'
import { createEvent, DIRECT_MESSAGE } from '@welshman/util'

// Create a NIP-59 instance from any signer
const nip59 = Nip59.fromSigner(mySigner)

// Wrap an event
const rumor = await nip59.wrap(
  recipientPubkey,
  createEvent(DIRECT_MESSAGE, {
    content: "Secret message",
    tags: [["p", recipientPubkey]]
  })
)

// The wrapped event to publish
const wrappedEvent = rumor.wrap

// Unwrap a received event
const unwrapped = await nip59.unwrap(receivedWrappedEvent)
```

### Wrapping Process

The wrapping process involves multiple steps:

1. Create the rumor (original event)
2. Create the seal (encrypted rumor)
3. Create the wrap (encrypted seal)

```typescript
export const wrap = async (
  signer: ISigner,
  wrapper: ISigner,
  pubkey: string,
  template: StampedEvent,
  tags: string[][] = []
) => {
  const rumor = await getRumor(signer, template)
  const seal = await getSeal(signer, pubkey, rumor)
  const wrap = await getWrap(wrapper, pubkey, seal, tags)

  return Object.assign(rumor, {wrap})
}
```

## API Reference

### Constructor & Factory Methods

```typescript
class Nip59 {
  // Constructor
  constructor(signer: ISigner, wrapper?: ISigner)

  // Factory Methods
  static fromSigner(signer: ISigner): Nip59
  static fromSecret(secret: string): Nip59

  // Instance Methods

  /**
   * Wraps an event for a specific recipient
   * @param pubkey Recipient's public key
   * @param template The event to wrap
   * @param tags Additional tags for the wrap event (optional)
   * @returns Promise<UnwrappedEvent> Original event and its wrapped version
   */
  wrap(
    pubkey: string,
    template: StampedEvent,
    tags?: string[][]
  ): Promise<UnwrappedEvent>

  /**
   * Unwraps a received wrapped event
   * @param event The wrapped event to decrypt
   * @returns Promise<UnwrappedEvent> The original unwrapped event
   */
  unwrap(event: SignedEvent): Promise<UnwrappedEvent>

  /**
   * Creates a new instance with a specific wrapper signer
   * @param wrapper Signer to use for wrapping events
   * @returns Nip59 New instance with the specified wrapper
   */
  withWrapper(wrapper: ISigner): Nip59
}
```

## Detailed Examples

### Basic Wrapping & Unwrapping

```typescript
import { Nip59, Nip01Signer } from '@welshman/signer'
import { createEvent, DIRECT_MESSAGE } from '@welshman/util'

async function example() {
  // Create NIP-59 instance
  const signer = new Nip01Signer(mySecret)
  const nip59 = Nip59.fromSigner(signer)

  // Create and wrap an event
  const event = createEvent(DIRECT_MESSAGE, {
    content: "Secret message",
    tags: [["p", recipientPubkey]]
  })

  const rumor = await nip59.wrap(recipientPubkey, event)

  // rumor contains:
  // - The original event (rumor)
  // - The wrapped version to publish (rumor.wrap)

  // Later, unwrap a received event
  const unwrapped = await nip59.unwrap(receivedEvent)
}
```

### Custom Wrapper Signer

```typescript
import { Nip59, Nip01Signer } from '@welshman/signer'

// Create with specific wrapper
const nip59 = new Nip59(
  mainSigner,
  Nip01Signer.ephemeral() // Custom wrapper
)

// Or add wrapper to existing instance
const nip59WithWrapper = nip59.withWrapper(
  Nip01Signer.ephemeral()
)
```
