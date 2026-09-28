# NIP-59 (Gift Wrap) Implementation

`Nip59` wraps and unwraps events under the Gift Wrap protocol (NIP-59). It works with any `ISigner`, and signs each wrap with a fresh ephemeral key unless given a wrapper signer. Each instance caches what it has unwrapped.

## Basic Usage

```typescript
import { Nip59 } from '@welshman/signer'
import { makeEvent, DIRECT_MESSAGE } from '@welshman/util'

const nip59 = Nip59.fromSigner(mySigner)

// Returns the gift-wrap SignedEvent to publish
const wrappedEvent = await nip59.wrap(
  recipientPubkey,
  makeEvent(DIRECT_MESSAGE, {
    content: "Secret message",
    tags: [["p", recipientPubkey]]
  })
)

const unwrapped = await nip59.unwrap(receivedWrappedEvent)
```

### Wrapping Process

The free function `wrap(signer, wrapper, pubkey, template, tags?)` builds three layers:

1. The rumor: the template, stamped with the author's pubkey and hashed but not signed
2. The seal: the rumor, NIP-44 encrypted to the recipient and signed by `signer`
3. The wrap: the seal, NIP-44 encrypted to the recipient and signed by `wrapper`, with a `p` tag for the recipient after any extra `tags`

`getSeal` and `getWrap` build the last two layers on their own.

### Unwrapping Process

`unwrap(signer, wrap)` decrypts the wrap to get the seal, decrypts the seal to get the rumor, and checks that the seal and rumor share an author. It throws if they don't, or if the result is not a hashed event. The free function does no caching; `Nip59.unwrap` does.

## API Reference

```typescript
class Nip59 {
  constructor(signer: ISigner, wrapper?: ISigner)

  static fromSigner(signer: ISigner): Nip59
  static fromSecret(secret: string): Nip59

  /**
   * Wraps an event for a specific recipient
   * @param pubkey Recipient's public key
   * @param template The event to wrap
   * @param tags Additional tags for the wrap event (optional)
   * @returns Promise<SignedEvent> The gift-wrap event to publish
   */
  wrap(
    pubkey: string,
    template: StampedEvent,
    tags?: string[][]
  ): Promise<SignedEvent>

  /**
   * Unwraps a received wrapped event, caching the result (or the failure) so
   * the same wrap is never decrypted twice by this instance
   * @param event The wrapped event to decrypt
   * @returns Promise<HashedEvent> The original unwrapped event
   */
  unwrap(event: SignedEvent): Promise<HashedEvent>

  /**
   * Creates a new instance with a specific wrapper signer
   * @param wrapper Signer to use for wrapping events
   * @returns Nip59 New instance with the specified wrapper
   */
  withWrapper(wrapper: ISigner): Nip59
}
```

## Custom Wrapper Signer

```typescript
import { Nip59, Nip01Signer } from '@welshman/signer'

const nip59 = new Nip59(mainSigner, Nip01Signer.ephemeral())

// Or derive an instance with a wrapper from an existing one
const nip59WithWrapper = nip59.withWrapper(Nip01Signer.ephemeral())
```
