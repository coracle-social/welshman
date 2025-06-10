# NIP-86 Relay Management

Implementation of NIP-86 for managing Nostr relays through authenticated RPC requests.

## Types

```typescript
export enum ManagementMethod {
  SupportedMethods = "supportedmethods",
  BanPubkey = "banpubkey",
  AllowPubkey = "allowpubkey",
  ListBannedPubkeys = "listbannedpubkeys",
  ListAllowedPubkeys = "listallowedpubkeys",
  ListEventsNeedingModeration = "listeventsneedingmoderation",
  AllowEvent = "allowevent",
  BanEvent = "banevent",
  ListBannedEvents = "listbannedevents",
  ChangeRelayName = "changerelayname",
  ChangeRelayDescription = "changerelaydescription",
  ChangeRelayIcon = "changerelayicon",
  AllowKind = "allowkind",
  DisallowKind = "disallowkind",
  ListAllowedKinds = "listallowedkinds",
  BlockIp = "blockip",
  UnblockIp = "unblockip",
  ListBlockedIps = "listblockedips",
}

export type ManagementRequest = {
  method: ManagementMethod
  params: string[]
}
```

## Functions

```typescript
// Sends a management request to a relay
export declare const sendManagementRequest: (url: string, request: ManagementRequest, authEvent: SignedEvent) => Promise<any>
```

## Example

```typescript
import { sendManagementRequest, ManagementMethod, makeHttpAuth } from '@welshman/util'

// Set up our url and params
const url = "https://relay.example.com/"
const payload = {method: ManagementMethod.SupportedMethods, params: []}

// Create auth event for the management endpoint
const authEvent = await makeHttpAuth(url, "POST", JSON.stringify(payload))
const signedAuthEvent = await signer.signEvent(authEvent)

// Get a list of supported methods
const response = await sendManagementRequest(url, payload, signedAuthEvent)
```
