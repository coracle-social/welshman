# NIP-07 Signer

The `Nip07Signer` implements the `ISigner` interface by delegating signing operations to a NIP-07 compatible browser extension (like nos2x or Alby). It provides a way to interact with user's keys that are securely stored in their browser extension.

## Browser Detection

```typescript
import { getNip07 } from '@welshman/signer'

// Check if a NIP-07 provider is available
if (getNip07()) {
  // Browser has a compatible extension installed
}
```

## Usage

```typescript
import { Nip07Signer } from '@welshman/signer'

// Create a new signer instance
const signer = new Nip07Signer()

// The extension will prompt the user for permission
// when operations are performed
```


## Complete Example

```typescript
import { Nip07Signer, getNip07 } from '@welshman/signer'
import { createEvent, NOTE } from '@welshman/util'

async function example() {
  // Check for NIP-07 provider
  if (!getNip07()) {
    throw new Error('No NIP-07 provider found. Please install a Nostr browser extension.')
  }

  // Create signer
  const signer = new Nip07Signer()

  try {
    // Get public key (will prompt user)
    const pubkey = await signer.getPubkey()
    console.log('Public key:', pubkey)

    // Create and sign an event (will prompt user)
    const event = createEvent(NOTE, {
      content: "Hello via browser extension!",
      tags: [["t", "test"]]
    })
    const signedEvent = await signer.sign(event)
    console.log('Signed event:', signedEvent)

    // Encrypt a message (will prompt user)
    const recipientPubkey = "..."
    const encrypted = await signer.nip44.encrypt(recipientPubkey, "Secret message")
    console.log('Encrypted message:', encrypted)
  } catch (error) {
    // Handle user rejection or other errors
    console.error('Operation failed:', error)
  }
}
```
