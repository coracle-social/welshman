# NIP-46 (Nostr Connect) Signer

The `Nip46Signer` implements remote signing capabilities through the Nostr Connect protocol (NIP-46). It allows applications to delegate signing operations to a remote signer (like a Nostr Bunker), providing enhanced security by keeping private keys separate from the application.

## Architecture

The implementation consists of two main classes:
- `Nip46Broker`: Handles the communication with the remote signer
- `Nip46Signer`: Implements the `ISigner` interface using the broker

## Getting Started

```typescript
import {
  makeSecret,
  Nip46Broker,
  Nip46Signer
} from '@welshman/signer'
import { createEvent, NOTE } from '@welshman/util'

async function connectToRemoteSigner() {
  // Initial setup
  const clientSecret = makeSecret()
  const relays = ['wss://relay.example.com']
  const broker = Nip46Broker.get({ relays, clientSecret })
  const signer = new Nip46Signer(broker)

  // Generate connection URL
  const ncUrl = await broker.makeNostrconnectUrl({
    name: "My App",
    description: "Testing remote signing"
  })

  // Show URL to user (e.g., as QR code)
  displayQRCode(ncUrl)

  try {
    // Wait for connection
    const response = await broker.waitForNostrconnect(
      ncUrl,
      new AbortController()
    )

    // Store signer info for later
    const bunkerUrl = broker.getBunkerUrl()
    localStorage.setItem('bunkerUrl', bunkerUrl)

    // Use the signer
    const event = createEvent(NOTE, {
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

// Reconnecting with saved bunker URL
async function reconnect() {
  const bunkerUrl = localStorage.getItem('bunkerUrl')
  if (!bunkerUrl) return null

  const {
    signerPubkey,
    connectSecret,
    relays
  } = Nip46Broker.parseBunkerUrl(bunkerUrl)

  const broker = Nip46Broker.get({
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
// Recommended: use the singleton factory
const broker = Nip46Broker.get({
  relays: string[],
  clientSecret: string,
  connectSecret?: string,
  signerPubkey?: string,
  algorithm?: "nip04" | "nip44"
})

// Direct instantiation (not recommended)
new Nip46Broker(params)
```

### Connection Methods

```typescript
// Generate a nostrconnect:// URL for the remote signer
broker.makeNostrconnectUrl(metadata: Record<string, string>): Promise<string>

// Wait for connection approval
broker.waitForNostrconnect(
  url: string,
  abort?: AbortController
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

### Remote Operations

```typescript
// Basic operations
broker.ping(): Promise<string>
broker.getPublicKey(): Promise<string>
broker.connect(connectSecret?: string, perms?: string): Promise<string>

// Signing and encryption
broker.signEvent(event: StampedEvent): Promise<SignedEvent>
broker.nip04Encrypt(pk: string, message: string): Promise<string>
broker.nip04Decrypt(pk: string, message: string): Promise<string>
broker.nip44Encrypt(pk: string, message: string): Promise<string>
broker.nip44Decrypt(pk: string, message: string): Promise<string>
```

## Nip46Signer Usage

```typescript
const signer = new Nip46Signer(broker)

// All ISigner operations are available
const pubkey = await signer.getPubkey()
const signed = await signer.sign(event)
const encrypted = await signer.nip44.encrypt(pubkey, "message")
const decrypted = await signer.nip44.decrypt(pubkey, encrypted)
```
