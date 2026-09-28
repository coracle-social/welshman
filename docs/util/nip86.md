# NIP-86 Relay Management

NIP-86 manages Nostr relays through RPC requests authenticated with NIP-98.

## Types

```typescript
export type ManagementRequest = {
  method: string
  params: any[]
}

export type ManagementResponse = {
  result?: any
  error?: string
}
```

## Functions

Each NIP-86 method has a request builder that returns a `ManagementRequest`, such as `makeSupportedMethods()`, `makeBanPubkey(pubkey, reason?)`, `makeAllowEvent(id, reason?)`, `makeChangeRelayName(name)`, and `makeBlockIp(ip, reason?)`. The `make*` builders also cover roles, method assignments, and claims.

```typescript
// Sends a management request to a relay
export declare const sendManagementRequest: (url: string, request: ManagementRequest, authEvent: SignedEvent) => Promise<ManagementResponse>
```

## Example

```typescript
import { sendManagementRequest, makeSupportedMethods, makeHttpAuth } from '@welshman/util'

// Set up our url and params
const url = "https://relay.example.com/"
const payload = makeSupportedMethods()

// Create auth event for the management endpoint
const authEvent = await makeHttpAuth(url, "POST", JSON.stringify(payload))
const signedAuthEvent = await signer.sign(authEvent)

// Get a list of supported methods
const response = await sendManagementRequest(url, payload, signedAuthEvent)
```
