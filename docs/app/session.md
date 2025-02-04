# Session Management

The session system provides a unified way to handle different authentication methods:
- Secret Key NIP-01
- Nostr Extensions NIP-07
- Bunker URL NIP-46
- Amber or in-device NIP-55

while managing user state and encryption capabilities.

## Overview

Sessions are stored in local storage and can be:
- Persisted across page reloads
- Used with multiple accounts
- Switched dynamically
- Backed by different signing methods

## Basic Usage

```typescript
import {ctx, setContext} from '@welshman/lib'
import {
  getDefaultNetContext,
  getDefaultAppContext,
  pubkey,
  sessions,
  session,
  addSession,
  getNip07
} from '@welshman/app'

// Set up app config
setContext({
  net: getDefaultNetContext(),
  app: getDefaultAppContext(),
})

// Log in via NIP-07 extension (browser wallet)
if (await getNip07()) {
  addSession({
    method: 'nip07',
    pubkey: await getNip07().getPublicKey()
  })
}

// Get current session
console.log(session.get()) // Current active session
console.log(pubkey.get()) // Current pubkey
```

## Multiple Sessions

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

## Session Persistence

Sessions are automatically persisted to local storage. On page load:

```typescript
import {pubkey, sessions} from '@welshman/app'

// Sessions load automatically from local storage
console.log(sessions.get()) // All stored sessions

// the current active session
console.log(session.get())

// Last active pubkey is restored
console.log(pubkey.get())
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

## Error Handling

```typescript
import {tryCatch} from '@welshman/lib'
import {addSession, getNip07} from '@welshman/app'

const login = async () => {
  const nip07 = await tryCatch(getNip07)

  if (!nip07) {
    throw new Error("No NIP-07 extension found")
  }

  const pubkey = await tryCatch(
    () => nip07.getPublicKey()
  )

  if (!pubkey) {
    throw new Error("Failed to get public key")
  }

  addSession({method: 'nip07', pubkey})
}
```
