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
  const signer = new Nip55Signer(apps[0].packageName)
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
constructor(packageName: string)
```
Creates a new signer instance that will communicate with the specified native app.
- `packageName`: The package identifier of the native signing app

### ISigner implementation

The `Nip55Signer` class implements the [`ISigner`](/signer/) interface

```typescript
class Nip55Signer implements ISigner {
  // Constructor
  constructor(private secret: string)

  // ISigner implementation
  sign: (event: StampedEvent) => Promise<SignedEvent>
  getPubkey: () => Promise<string>
  nip04: { encrypt, decrypt }
  nip44: { encrypt, decrypt }
}
```


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

## Implementation Details

### Request Serialization

The signer implements a lock mechanism to prevent concurrent requests:

```typescript
class Nip55Signer implements ISigner {
  #lock = Promise.resolve()
  #plugin = NostrSignerPlugin
  #packageName: string
  #packageNameSet = false

  #then = async <T>(f: (signer: typeof NostrSignerPlugin) => Promise<T>) => {
    const promise = this.#lock.then(async () => {
      if (!this.#packageNameSet) {
        await this.#initialize()
      }
      return f(this.#plugin)
    })

    this.#lock = promise.then(() => Promise.resolve())

    return promise
  }
}
```

### Public Key Caching

The signer caches the public key to minimize native app interactions:

```typescript
class Nip55Signer {
  #npub?: string
  #publicKey?: string

  getPubkey = async (): Promise<string> => {
    return this.#then(async signer => {
      if (!this.#publicKey || !this.#npub) {
        const {npub} = await signer.getPublicKey()
        this.#npub = npub
        const {data} = decode(npub)
        this.#publicKey = data as string
      }
      return this.#publicKey
    })
  }
}
```


## Platform Support

- iOS: Requires compatible signing app
- Android: Requires compatible signing app
- Operations availability depends on native app implementation
- Some features might be platform-specific
