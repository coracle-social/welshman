# NIP-98 HTTP Auth

Implementation of NIP-98 HTTP Authentication for authenticating HTTP requests with Nostr events.

## Functions

```typescript
// Creates an HTTP auth event for authenticating requests
export declare const makeHttpAuth: (url: string, method?: string, body?: string) => Promise<Event>

// Creates Authorization header from signed HTTP auth event
export declare const makeHttpAuthHeader: (event: SignedEvent) => string
```

## Example

```typescript
import { makeHttpAuth, makeHttpAuthHeader } from '@welshman/util'

const url = "https://api.example.com/upload"
const method = "POST"
const body = {data: "example"}

// Create HTTP auth event
const authEvent = await makeHttpAuth(url, method, JSON.stringify(body))

// Sign the auth event
const signedEvent = await signer.signEvent(authEvent)

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
