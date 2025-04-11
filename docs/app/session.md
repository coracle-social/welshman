# Session Management

The session system provides a unified way to handle different authentication methods:

- NIP-01 via Secret Key
- NIP-07 via Browser Extension
- NIP-46 via Bunker URL or Nostrconnect
- NIP-55 via Android Signer Application
- Read-only pubkey login

## Overview

Sessions are stored in local storage and can be:

- Persisted across page reloads
- Used with multiple accounts
- Switched dynamically
- Backed by different signing methods

## NIP 01 Example

The simplest type of login is NIP 01, although it's generally a bad idea to be handling user keys. NIP 46, 44, or 07 login are preferable. However, NIP 01 can be useful for supporting signup, local profiles, or ephemeral keys.

```typescript
import {makeSecret} from '@welshman/signer'
import {loginWithNip01} from '@welshman/app'

loginWithNip01(makeSecret())
```

## NIP 07 Example

A simple way to sign in for desktop browser users is using [NIP 07](https://github.com/nostr-protocol/nips/blob/master/07.md). This method is easy to implement, but should be used sparingly, since not all users will be using a browser with a nostr signing extension installed.

```typescript
import {Nip07Signer} from '@welshman/signer'
import {loginWithNip07} from '@welshman/app'

const signer = new Nip07Signer()

signer.getPubkey().then(pubkey => {
  if (pubkey) {
    loginWithNip07(pubkey)
  } else {
    // User extension does not exist or did not respond
  }
})
```

## NIP-46 Authentication

The best default signing scheme is [NIP 46](https://github.com/nostr-protocol/nips/blob/master/46.md), AKA "Nostr Connect". This supports multiple handshakes depending on desired UX, and can support advanced use cases like secure enclaves, self-hosted keys, and FROST multisig.

The simpler `bunker://` handshake is done by asking the user to provide a bunker URL, either by QR code, or by pasting it manually into your application.

```typescript
import {Nip46Broker, makeSecret} from "@welshman/signer"
import {loginWithNip46, nip46Perms} from "@welshman/app"
import {isKeyValid} from "src/util/nostr"

// Make a client secret - this is distinct from the user's private key, and is used
// for communicating securely with the remote signer
const clientSecret = makeSecret()

// Ask the user to input their bunker URL
const bunkerUrl = prompt("Please enter your bunker url")

// Pase the bunker url
const {signerPubkey, connectSecret, relays} = Nip46Broker.parseBunkerUrl(bunkerUrl)

if (!isKeyValid(signerPubkey)) {
  alert("Sorry, but that's an invalid public key.")
} else if (relays.length === 0) {
  alert("That connection string doesn't have any relays.")
} else {
  // Open up a connection with the signer
  const broker = Nip46Broker.get({relays, clientSecret, signerPubkey})

  // Send a connect request with the default permissions
  const result = await broker.connect(connectSecret, nip46Perms)

  // Make sure to check the connect secret to prevent hijacking
  if (result === connectSecret) {
    // Get the user's public key
    const pubkey = await broker.getPublicKey()

    if (!pubkey) {
      alert("Failed to initialize session")
    } else {
      loginWithNip46(pubkey, clientSecret, signerPubkey, relays)
    }
  }
}
```

Alternatively, you can provide the user with a `nostrconnect://` URL which they can copy or scan with their signer. This is a better UX for users using a signer on their mobile phone.

```typescript
import {Nip46Broker, makeSecret} from "@welshman/signer"
import {loginWithNip46, nip46Perms} from "@welshman/app"

// Create a client secret
const clientSecret = makeSecret()

// Stop listening if the user cancels login
const abortController = new AbortController()

// Customize to use relays the signer can send responses to
const relays = ['wss://relay.nsec.app/']

// Create a broker
const broker = Nip46Broker.get({clientSecret, relays})

// Create a nostrconnect:// url
const nostrconnect = await broker.makeNostrconnectUrl({
  name: "My App",
  url: window.origin,
  image: window.origin + '/logo.png',
  perms: nip46Perms,
})

// Share it with the user. Displaying a QR code is particularly helpful
alert("To connect, paste this URL into your signer: " + nostrconnect)

// Listen for the response
let response
try {
  response = await broker.waitForNostrconnect(nostrconnect, abortController.signal)
} catch (errorResponse: any) {
  if (errorResponse?.error) {
    alert(`Received error from signer: ${errorResponse.error}`)
  } else if (errorResponse) {
    console.error(errorResponse)
  }
}

// If we got a response, the broker is already connected and we can log in
if (response) {
  const pubkey = await broker.getPublicKey()

  if (!pubkey) {
    alert("Failed to initialize session")
  } else {
    loginWithNip46(pubkey, clientSecret, response.event.pubkey, relays)
  }
}
```

## NIP-55 Authentication

For the best UX on Android, use [NIP 55](https://github.com/nostr-protocol/nips/blob/master/55.md). Note that this only works for web applications that have been compiled to native Android applications using [CapacitorJS](https://capacitorjs.com/) and [nostr-signer-capacitor-plugin](https://github.com/chebizarro/nostr-signer-capacitor-plugin).

```typescript
import {getNip55, Nip55Signer, loginWithNip55} from "@welshman/signer"

// Query for installed apps that implement nip 55 signing
getNip55().then(signerApps => {
  // We'll choose the first one and auto-login, but in most cases you'll want to offer a choice
  if (signerApps.length > 0) {
    const signer = new Nip55Signer(signerApps[0].packageName)
    const pubkey = await signer.getPubkey()

    if (pubkey) {
      loginWithNip55(pubkey, app.packageName)
    }
  }
})
```

## Read-only session

A fun feature of nostr is that you can log in as other people, and see what nostr is like from their perspective (minus encrypted data or course).

```typescript
import {loginWithPubkey} from "@welshman/signer"

// Log in as hodlbod
loginWithPubkey("97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322")
```

## Using the current session

```typescript
import {signer, session} from '@welshman/app'
import {createEvent, NOTE} from '@welshman/util'

// Print the current session - be aware the private key is stored in memory, be very
// careful about how you handle session objects!
console.log(session.get())

// Current session's signer is always ready to use
const event = await signer.get().sign(
  createEvent(NOTE, {content: "Hello Nostr!"})
)

// hodlbod's pubkey
const otherPubkey = "97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322"

// Encrypt content for private notes
const ciphertext = await signer.get().nip44.encrypt(otherPubkey, "Secret message")

// Decrypt automatically detects encryption version
const plaintext = await decrypt(signer, otherPubkey, ciphertext)
```

## Multiple sessions

It's possible to support multiple concurrent sessions by simply calling `addSession` multiple times. This will update `sessions`, and set `pubkey` to the most recently added session. You can then switch between sessions by calling `pubkey.set` with a valid session pubkey, and delete sessions using `dropSession(pubkey)`.
