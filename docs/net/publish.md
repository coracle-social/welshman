# Publish

Utilities for publishing events to Nostr relays with status tracking and callback handling.

## Enums

### PublishStatus

Status values for publish operations:
- `Sending` - Event is being sent
- `Pending` - Waiting for relay response
- `Success` - Event published successfully
- `Failure` - Event rejected by relay
- `Timeout` - Request timed out
- `Aborted` - Request was aborted

## Functions

### publishOne(options)

Publishes an event to a single relay and returns a promise that resolves with the publish status.

**Options:**
- `event` - The signed event to publish
- `relay` - Relay URL
- `signal?` - AbortSignal for cancellation
- `timeout?` - Timeout in milliseconds (default: 10000)
- `context?` - Adapter context
- Callback functions: `onSuccess`, `onFailure`, `onPending`, `onTimeout`, `onAborted`, `onComplete`

### publish(options)

Publishes an event to multiple relays in parallel and returns a status object mapping relay URLs to their publish status.

## Example

```typescript
import {publish, PublishStatus} from "@welshman/net"

const event = {
  // ... signed event
}

const statusByRelay = await publish({
  event,
  relays: ["wss://relay1.com", "wss://relay2.com"],
  timeout: 5000,
  onSuccess: (detail, relay) => console.log(`Published to ${relay}`),
  onFailure: (detail, relay) => console.log(`Failed on ${relay}: ${detail}`)
})

console.log(statusByRelay) // { "wss://relay1.com": "success", "wss://relay2.com": "failure" }
```