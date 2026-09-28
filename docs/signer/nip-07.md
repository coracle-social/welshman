# NIP-07 Signer

`Nip07Signer` implements `ISigner` by delegating to a NIP-07 browser extension such as nos2x or Alby, which holds the user's keys. The extension may prompt the user as operations are performed.

## Browser Detection

```typescript
import { getNip07 } from '@welshman/signer'

if (getNip07()) {
  // A NIP-07 extension is installed
}
```

## Example

```typescript
import { Nip07Signer, getNip07 } from '@welshman/signer'
import { makeEvent, NOTE } from '@welshman/util'

async function example() {
  if (!getNip07()) {
    throw new Error('No NIP-07 provider found. Please install a Nostr browser extension.')
  }

  const signer = new Nip07Signer()

  try {
    const pubkey = await signer.getPubkey()
    console.log('Public key:', pubkey)

    const event = makeEvent(NOTE, {
      content: "Hello via browser extension!",
      tags: [["t", "test"]]
    })
    const signedEvent = await signer.sign(event)
    console.log('Signed event:', signedEvent)

    const recipientPubkey = "..."
    const encrypted = await signer.nip44.encrypt(recipientPubkey, "Secret message")
    console.log('Encrypted message:', encrypted)
  } catch (error) {
    console.error('Operation failed:', error)
  }
}
```
