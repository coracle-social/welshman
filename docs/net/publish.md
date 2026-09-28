# Publish

Functions for publishing events to relays, with per-relay status and callbacks.

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

`Record<string, PublishResult>`, mapping relay URLs to their publish results.

## Functions

### publishOne(options)

Publishes an event to a single relay and returns a promise that resolves with a `PublishResult`.

**Options:**
- `event` - The signed event to publish
- `relay` - Relay URL
- `signal?` - AbortSignal for cancellation
- `timeout?` - Timeout in milliseconds (default: 10000)
- `priority?` - Send priority on the socket's queue
- `context?` - Adapter context
- Callback functions (all receive `PublishResult`): `onSuccess`, `onFailure`, `onPending`, `onTimeout`, `onAborted`, `onComplete`

### publish(options)

Publishes an event to multiple relays in parallel and resolves to a `PublishResultsByRelay`. It takes `relays` in place of `relay`, and calls `onComplete` once, after every relay has finished.

## Example

```typescript
import {publish, PublishStatus} from "@welshman/net"

const resultsByRelay = await publish({
  event: signedEvent,
  relays: ["wss://relay1.com", "wss://relay2.com"],
  timeout: 5000,
  context,
  onSuccess: (result) => console.log(`Published to ${result.relay}: ${result.detail}`),
  onFailure: (result) => console.log(`Failed on ${result.relay}: ${result.detail}`)
})

console.log(resultsByRelay)
// {
//   "wss://relay1.com": {relay: "wss://relay1.com", status: PublishStatus.Success, detail: "ok"},
//   "wss://relay2.com": {relay: "wss://relay2.com", status: PublishStatus.Failure, detail: "invalid: ..."}
// }
```