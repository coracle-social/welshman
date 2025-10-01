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

## Types

### PublishResult

Result object for publish operations:
- `relay` - The relay URL
- `status` - PublishStatus enum value
- `detail` - Human-readable status message

### PublishResultsByRelay

Type alias for `Record<string, PublishResult>` - maps relay URLs to their publish results.

## Functions

### publishOne(options)

Publishes an event to a single relay and returns a promise that resolves with a `PublishResult`.

**Options:**
- `event` - The signed event to publish
- `relay` - Relay URL
- `signal?` - AbortSignal for cancellation
- `timeout?` - Timeout in milliseconds (default: 10000)
- `context?` - Adapter context
- Callback functions (all receive `PublishResult`): `onSuccess`, `onFailure`, `onPending`, `onTimeout`, `onAborted`, `onComplete`

### publish(options)

Publishes an event to multiple relays in parallel and returns a `PublishResultsByRelay` object mapping relay URLs to their publish results.

## Example

```typescript
import {publish, PublishStatus} from "@welshman/net"

const event = {
  // ... signed event
}

const resultsByRelay = await publish({
  event,
  relays: ["wss://relay1.com", "wss://relay2.com"],
  timeout: 5000,
  onSuccess: (result) => console.log(`Published to ${result.relay}: ${result.detail}`),
  onFailure: (result) => console.log(`Failed on ${result.relay}: ${result.detail}`)
})

console.log(resultsByRelay)
// {
//   "wss://relay1.com": {relay: "wss://relay1.com", status: PublishStatus.Success, detail: "ok"},
//   "wss://relay2.com": {relay: "wss://relay2.com", status: PublishStatus.Failure, detail: "invalid: ..."}
// }
```