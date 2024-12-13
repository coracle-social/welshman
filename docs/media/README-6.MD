# @welshman/signer [![version](https://badgen.net/npm/v/@welshman/signer)](https://npmjs.com/package/@welshman/signer)

Implementations of signer utilities and classes.

## Nips supported

- NIP 01 (private key login)
- NIP 07
- NIP 46
- NIP 55
- NIP 59 (gift wrapping, works with any signer that supports encryption)

## Examples

### NIP 01

```typescript
import {makeSecret, Nip01Signer} from '@welshman/signer'

const signer = Nip01Signer.fromSecret(makeSecret())
```

### NIP 07

```typescript
import {getNip07, Nip07Signer} from '@welshman/signer'

if (getNip07()) {
  const signer = new Nip07Signer()
}
```

### NIP 55

```typescript
import {getNip07, Nip07Signer} from '@welshman/signer'

if (getNip07()) {
  const signer = new Nip07Signer()
}
```

### NIP 46

```typescript
import {createEvent, NOTE} from '@welshman/util'
import {makeSecret, Nip46Broker, Nip46Signer} from '@welshman/signer'

const clientSecret = makeSecret()
const relays = ['wss://relay.signer.example/']
const broker = Nip46Broker.get({relays, clientSecret})
const signer = new Nip46Signer(broker)
const ncUrl = broker.makeNostrconnectUrl({name: "My app"})
const abortController = new AbortController()

let response
try {
  response = await broker.waitForNostrconnect(url, abortController)
} catch (e: any) {
  if (e?.error) {
    showWarning(`Received error from signer: ${e.error}`)
  } else if (e) {
    console.error(e)
  }
}

if (response) {
  // Now we know the bunker's pubkey and can do stuff with the signer
  const signerPubkey = response.event.pubkey

  // Next time we want to use our signer, we can instantiate it like so:
  const newBroker = Nip46Broker.get({relays, clientSecret, signerPubkey})
  const newSigner = new Nip46Signer(newBroker)
}
```

### Using signers

```typescript
import {createEvent, NOTE, DIRECT_MESSAGE} from '@welshman/util'

const signer = // Create your signer...
const nip59 = Nip59.fromSigner(signer)

// Sign an event
const event = await signer.sign(createEvent(NOTE, {content: "hi"}))

// Wrap a NIP 17 DM
const rumor = await nip59.wrap(recipientPubkey, createEvent(DIRECT_MESSAGE, {content: "hi"}))

// Note that it returns a rumor; be sure to publish the `wrap`
const wrap = rumor.wrap
```
