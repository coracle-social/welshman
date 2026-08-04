# NIP-55 (Native App) Signer

The `Nip55Signer` implements the `ISigner` interface by communicating with native mobile signing applications through the Capacitor plugin system. This implementation is particularly useful for mobile applications that want to leverage native Nostr signing capabilities.

## Prerequisites

The signer requires the Capacitor plugin to be installed:

```bash
npm install nostr-signer-capacitor-plugin
```

`@welshman/signer` does not import the plugin itself — it only describes the shape it needs
as the `Nip55` type, so that apps which don't support NIP-55 never have to resolve a package
they haven't installed. Your app hands the plugin over once at startup:

```typescript
import { NostrSignerPlugin } from 'nostr-signer-capacitor-plugin'
import { setNip55Plugin } from '@welshman/signer'

setNip55Plugin(NostrSignerPlugin)
```

Until you do, `getNip55()` returns an empty list and `Nip55Signer` operations reject with
`"Nip55 is not enabled"` — the same way `Nip07Signer` behaves without a browser extension.

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

### Registering the Plugin

```typescript
setNip55Plugin(plugin: Nip55 | undefined): void
getNip55Plugin(): Nip55 | undefined
```

### Detecting Available Signers

```typescript
// Returns information about installed signing apps, or [] if no plugin is registered
getNip55(): Promise<Nip55AppInfo[]>

interface Nip55AppInfo {
  name: string
  packageName: string
  iconUrl?: string
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
import { NostrSignerPlugin } from 'nostr-signer-capacitor-plugin'
import { Nip55Signer, getNip55, setNip55Plugin } from '@welshman/signer'
import { makeEvent, NOTE } from '@welshman/util'

setNip55Plugin(NostrSignerPlugin)

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
    const event = makeEvent(NOTE, {
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
