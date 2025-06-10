# NIP-42

Utilities for NIP-42 relay authentication, allowing clients to authenticate with relays that require it.

## Functions

### makeRelayAuth(url, challenge)

Creates a CLIENT_AUTH event (kind 22242) for relay authentication as specified in NIP-42.

**Parameters:**
- `url` - The relay URL to authenticate with
- `challenge` - The challenge string provided by the relay

**Returns:** Unsigned event object with relay and challenge tags

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
