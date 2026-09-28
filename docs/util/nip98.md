# NIP-98 HTTP Auth

NIP-98 authenticates HTTP requests with signed Nostr events.

## Functions

```typescript
// Creates an HTTP auth event for authenticating requests
export declare const makeHttpAuth: (url: string, method?: string, body?: string) => Promise<StampedEvent>

// Creates Authorization header from signed HTTP auth event
export declare const makeHttpAuthHeader: (event: SignedEvent) => string
```

## Example

```typescript
import { makeHttpAuth, makeHttpAuthHeader } from '@welshman/util'

const url = "https://api.example.com/upload"
const method = "POST"
const body = JSON.stringify({data: "example"})

// Create HTTP auth event
const authEvent = await makeHttpAuth(url, method, body)

// Sign the auth event
const signedEvent = await signer.sign(authEvent)

// Create Authorization header
const authHeader = makeHttpAuthHeader(signedEvent)

// Use in fetch request
const response = await fetch(url, {
  body,
  method,
  headers: {
    "Authorization": authHeader,
    "Content-Type": "application/json"
  },
})
```
