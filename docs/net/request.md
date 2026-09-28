# Request

Functions for requesting events from relays, with validation, deduplication, and batching.

## Functions

### requestOne(options)

Requests events from a single relay using the given filters. Returns a promise that resolves with deduplicated events once every subscription has closed.

**Options:**
- `relay` - Relay URL
- `filters` - Array of Nostr filters. Each filter is sent as its own subscription
- `signal?` - AbortSignal for cancellation
- `priority?` - Send priority on the socket's queue
- `tracker?` - Event tracker for deduplication
- `context?` - Adapter context
- `autoClose?` - Close the subscription after EOSE, on socket disconnect, or 30 seconds in, whichever comes first
- `resubscribeAttempts?` - How many times to ask again for a subscription the relay dropped for a reason that might not hold next time, such as a rate limit. Defaults to 0. Refusals NIP-01 marks as final (`restricted:`, `blocked:`, and the rest of `RelayReasonPrefix`) are never retried, and each retry reaches back to the time of the refusal. Only meaningful without `autoClose`.
- `isEventValid?` - Signature check, defaulting to `verifyEvent`
- Callback functions: `onEvent`, `onDeleted`, `onInvalid`, `onFiltered`, `onDuplicate`, `onDisconnect`, `onEose`, `onClosed`, `onClose`
  - `onClosed?: (message: string, url: string) => void` - Called when the relay sends a CLOSED message, receiving the close reason and relay URL
  - `onClose?: () => void` - Called when the subscription is fully closed

### request(options)

Requests events from multiple relays in parallel, sharing one tracker across them. Returns a promise that resolves with all events from all relays.

**Options:**
- `relays` - Array of relay URLs
- `filters` - Array of Nostr filters
- `threshold?` - Fraction of relays that must close before completing (default: 1)
- All other options from `requestOne`

### makeLoader(options)

Creates a loader that delays requests and combines those made within `delay` into a single request per relay.

**Options:**
- `delay` - Batch delay in milliseconds
- `timeout?` - Request timeout
- `threshold?` - Relay completion threshold
- `context?` - Adapter context
- `isEventValid?` - Signature check

The loader takes `relays`, `filters`, an optional `signal`, and the optional callbacks `onEvent`, `onDisconnect`, `onEose` and `onClose`.

Without a `threshold` the loader resolves once every relay has closed or timed out. With `threshold: 0.5` it resolves once half have closed; the rest stay open and their events still arrive. `app.use(Network)` exposes `loadComplete` and `loadLenient`, two loaders bound to the app's context with those settings.

## Example

```typescript
import {request, makeLoader} from "@welshman/net"

// Without autoClose or a signal this streams indefinitely, and the default socket
// policies re-send the subscription when the socket reconnects
const events = await request({
  relays: ["wss://relay1.com", "wss://relay2.com"],
  filters: [{kinds: [1], limit: 10}],
  context,
  onEvent: (event, url) => console.log(`Event from ${url}:`, event.id)
})

const load = makeLoader({delay: 30, timeout: 3000, context})

const profileEvents = await load({
  relays: ["wss://relay1.com"],
  filters: [{kinds: [0], authors: ["pubkey1", "pubkey2"]}]
})
```
