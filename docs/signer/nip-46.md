# NIP-46 (Nostr Connect) Signer

`Nip46Signer` delegates signing to a remote signer, such as a bunker, over the Nostr Connect protocol (NIP-46), so the private key never reaches the application.

## Architecture

The implementation has two main classes:
- `Nip46Broker`: Handles the communication with the remote signer
- `Nip46Signer`: Implements the `ISigner` interface using the broker

## Example

```typescript
import {Nip46Broker, Nip46Signer} from '@welshman/signer'
import {makeEvent, makeSecret, NOTE} from '@welshman/util'

async function connectToRemoteSigner() {
  const clientSecret = makeSecret()
  const relays = ['wss://relay.example.com']
  const broker = new Nip46Broker({ relays, clientSecret })
  const signer = new Nip46Signer(broker)

  const ncUrl = await broker.makeNostrconnectUrl({
    name: "My App",
    description: "Testing remote signing"
  })

  // Show the URL to the user, e.g. as a QR code
  displayQRCode(ncUrl)

  try {
    const abortController = new AbortController()
    await broker.waitForNostrconnect(
      ncUrl,
      abortController.signal
    )

    // Save the session for reconnecting later
    const bunkerUrl = broker.getBunkerUrl()
    localStorage.setItem('bunkerUrl', bunkerUrl)

    const event = makeEvent(NOTE, {
      content: "Signed with remote signer!",
      tags: [["t", "test"]]
    })
    const signed = await signer.sign(event)

    return signed
  } catch (error) {
    if (error?.error) {
      console.warn(`Signer error: ${error.error}`)
    }
    throw error
  }
}

async function reconnect() {
  const bunkerUrl = localStorage.getItem('bunkerUrl')
  if (!bunkerUrl) return

  const {
    signerPubkey,
    connectSecret,
    relays
  } = Nip46Broker.parseBunkerUrl(bunkerUrl)

  const broker = new Nip46Broker({
    relays,
    clientSecret: makeSecret(),
    signerPubkey,
    connectSecret
  })

  return new Nip46Signer(broker)
}
```

## Nip46Broker API

### Constructor and Factory

```typescript
new Nip46Broker({
  relays: string[],
  clientSecret: string,
  connectSecret?: string,
  signerPubkey?: string,
  algorithm?: "nip04" | "nip44",
  context?: AdapterContext
})

// Static factory: create a broker from a bunker:// URL
Nip46Broker.fromBunkerUrl(url: string): Nip46Broker
```

### Connection Methods

```typescript
// Generate a nostrconnect:// URL for the remote signer
broker.makeNostrconnectUrl(metadata: Record<string, string>): Promise<string>

// Wait for the remote signer to approve the connection
broker.waitForNostrconnect(
  url: string,
  signal: AbortSignal
): Promise<Nip46ResponseWithResult>

// Get bunker URL for later reconnection
broker.getBunkerUrl(): string

// Parse a bunker URL
Nip46Broker.parseBunkerUrl(url: string): {
  signerPubkey: string,
  connectSecret: string,
  relays: string[]
}
```

## Nip46Signer Usage

```typescript
const signer = new Nip46Signer(broker)

const pubkey = await signer.getPubkey()
const signed = await signer.sign(event)
const encrypted = await signer.nip44.encrypt(pubkey, "message")
const decrypted = await signer.nip44.decrypt(pubkey, encrypted)
```
