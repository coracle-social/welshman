# NIP-42

Builds the NIP-42 auth event a client signs to authenticate with a relay.

## Functions

### makeRelayAuth(url, challenge)

Creates a CLIENT_AUTH event (kind 22242) for relay authentication as specified in NIP-42.

**Parameters:**
- `url` - The relay URL to authenticate with
- `challenge` - The challenge string provided by the relay

**Returns:** An unsigned `StampedEvent` with `relay` and `challenge` tags

## Example

```typescript
import {makeRelayAuth} from "@welshman/util"

// Create auth event when relay sends AUTH challenge
const authEvent = makeRelayAuth(
  "wss://relay.example.com",
  "challenge-string-from-relay"
)

// Sign the event with your signer
const signedAuth = await signer.sign(authEvent)
```
