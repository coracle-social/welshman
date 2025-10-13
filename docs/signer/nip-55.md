# NIP-55 (Native App) Signer

The `Nip55Signer` implements the `ISigner` interface by communicating with native mobile signing applications through the Capacitor plugin system. This implementation is particularly useful for mobile applications that want to leverage native Nostr signing capabilities.

## Prerequisites

The signer requires the Capacitor plugin to be installed:

```bash
npm install nostr-signer-capacitor-plugin
```

## Getting Started

```typescript
import { Nip55Signer, getNip55 } from '@welshman/signer'

// Check for available signing apps
const apps = await getNip55()
if (apps.length > 0) {
  const optionalSavedPubkey = localStorage.getItem('my-saved-pubkey')
  const signer = new Nip55Signer(apps[0].packageName, optionalSavedPubkey)
}
```

## API Reference

### Detecting Available Signers

```typescript
// Returns information about installed signing apps
getNip55(): Promise<AppInfo[]>

interface AppInfo {
  name: string
  packageName: string
  // Other app-specific information
}
```

### Constructor

```typescript
constructor(packageName: string, publicKey?: string)
```
Creates a new signer instance that will communicate with the specified native app.
- `packageName`: The package identifier of the native signing app
- `publicKey`: optional user pubkey. Recommended for resuming existing signer sessions when the signer is managing multiple user accounts.

## Complete Example

```typescript
import { Nip55Signer, getNip55 } from '@welshman/signer'
import { createEvent, NOTE } from '@welshman/util'

async function example() {
  try {
    // Get available signing apps
    const apps = await getNip55()
    if (apps.length === 0) {
      throw new Error('No native signing apps available')
    }

    // Create signer with first available app
    const signer = new Nip55Signer(apps[0].packageName)

    // Get public key
    const pubkey = await signer.getPubkey()
    console.log('Public key:', pubkey)

    // Sign an event
    const event = createEvent(NOTE, {
      content: "Hello from native app!",
      tags: [["t", "test"]]
    })
    const signedEvent = await signer.sign(event)
    console.log('Signed event:', signedEvent)

    // Encrypt a message
    const encrypted = await signer.nip44.encrypt(
      recipientPubkey,
      "Secret message"
    )
    console.log('Encrypted:', encrypted)

  } catch (error) {
    console.error('Native signer error:', error)
  }
}
```
