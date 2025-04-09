# Session Management

The session system provides a unified way to handle different authentication methods:

- NIP-01 via Secret Key
- NIP-07 via Browser Extension
- NIP-46 via Bunker URL or Nostrconnect
- NIP-55 via Android Signer Application

## Overview

Sessions are stored in local storage and can be:

- Persisted across page reloads
- Used with multiple accounts
- Switched dynamically
- Backed by different signing methods

## Basic Usage

```typescript
import {sessions, pubkey, addSession, dropSession} from '@welshman/app'

// Add multiple sessions
addSession({method: 'nip07', pubkey: 'abc...'})
addSession({method: 'nip46', pubkey: 'def...', secret: '123'})

// Switch between sessions
pubkey.set('abc...') // Activates that session

// Remove a session
dropSession('abc...')

// List all sessions
console.log(sessions.get())
```

## NIP-46 (Bunker) Authentication

```typescript
import {Nip46Broker, Nip46Signer} from '@welshman/signer'
import {addSession} from '@welshman/app'

// Connect to a bunker
const clientSecret = makeSecret()
const relays = ['wss://relay.damus.io']
const broker = Nip46Broker.get({relays, clientSecret})

// Generate nostrconnect URL for the bunker
const connectUrl = await broker.makeNostrconnectUrl({
  name: "My App",
  url: "https://myapp.com"
})

// Wait for user to approve in bunker
const response = await broker.waitForNostrconnect(connectUrl)

// Create session
addSession({
  method: 'nip46',
  pubkey: response.event.pubkey,
  secret: clientSecret,
  handler: {
    pubkey: response.event.pubkey,
    relays
  }
})
```

## Using Session Signer

```typescript
import {signer, session} from '@welshman/app'
import {createEvent, NOTE} from '@welshman/util'

// Current session's signer is always ready to use
const event = await signer.get().sign(
  createEvent(NOTE, {content: "Hello Nostr!"})
)

// Encrypt content for private notes
const encrypted = await signer.get().nip44.encrypt(
  pubkey,
  "Secret message"
)
```

## Session Types

```typescript
type SessionNip07 = {
  method: "nip07"
  pubkey: string
}

type SessionNip46 = {
  method: "nip46"
  pubkey: string
  secret: string
  handler: {
    pubkey: string
    relays: string[]
  }
}

type SessionNip01 = {
  method: "nip01"
  pubkey: string
  secret: string
}
```
