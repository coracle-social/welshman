# Request

Utilities for requesting events from Nostr relays with filtering, deduplication, and batching capabilities.

## Functions

### requestOne(options)

Requests events from a single relay using the given filters. Returns a promise that resolves with deduplicated events.

**Options:**
- `relay` - Relay URL
- `filters` - Array of Nostr filters
- `signal?` - AbortSignal for cancellation
- `tracker?` - Event tracker for deduplication
- `context?` - Adapter context
- `autoClose?` - Auto-close subscription after EOSE
- `resubscribeAttempts?` - How many times to ask again for a subscription the relay dropped for a reason that might not hold next time — a rate limit, more subscriptions than it allows. Defaults to 0, so a request that wants to survive a refusal opts in. Refusals NIP-01 marks as final (`restricted:`, `blocked:`, and the rest of `RelayReasonPrefix`) are never retried, and each retry reaches back to the refusal so the time spent backing off isn't a gap. Only meaningful without `autoClose`.
- Validation functions: `isEventValid`, `isEventDeleted`
- Callback functions: `onEvent`, `onDeleted`, `onInvalid`, `onFiltered`, `onDuplicate`, `onDisconnect`, `onEose`, `onClosed`, `onClose`
  - `onClosed?: (message: string, url: string) => void` - Called when the relay sends a CLOSED message, receiving the close reason and relay URL
  - `onClose?: () => void` - Called when the subscription is fully closed

### request(options)

Requests events from multiple relays in parallel. Returns a promise that resolves with all events from all relays.

**Options:**
- `relays` - Array of relay URLs
- `filters` - Array of Nostr filters
- `threshold?` - Fraction of relays that must close before completing (default: 1)
- All other options from `requestOne`

### makeLoader(options)

Creates a batched loader function that delays and combines requests for efficiency.

**Options:**
- `delay` - Batch delay in milliseconds
- `timeout?` - Request timeout
- `threshold?` - Relay completion threshold
- Validation functions and context options

### load(options)

Pre-configured loader with 200ms delay, 3s timeout, and 0.5 threshold. Takes a `LoadOptions` object containing `relays`, `filters`, and optional callback fields (`onEvent`, `onDisconnect`, `onEose`, `onClose`) and an optional `signal`.

## Example

```typescript
import {request, load} from "@welshman/net"

// Simple request - without autoClose or a signal this will continue to stream indefinitely.
// Default policies (see policy.ts) will also re-send the subscription when sockets reconnect
const events = await request({
  relays: ["wss://relay1.com", "wss://relay2.com"],
  filters: [{kinds: [1], limit: 10}],
  onEvent: (event, url) => console.log(`Event from ${url}:`, event.id)
})

// Batched loading (more efficient for multiple requests)
const profileEvents = await load({
  relays: ["wss://relay1.com"],
  filters: [{kinds: [0], authors: ["pubkey1", "pubkey2"]}]
})
```
