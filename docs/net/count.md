# Count

Functions for asking relays how many events match some filters, using NIP-45 COUNT.

## Functions

### countOne(options)

Asks one relay for a count. Resolves to the relay's answer, or `undefined` when the relay does not answer, which is a different result from `0`.

**Options:**
- `relay` - Relay URL
- `filters` - Array of Nostr filters, sent in one COUNT message
- `signal?` - AbortSignal for cancellation
- `context?` - Adapter context

Support is read off the wire rather than from NIP-11. A relay that refuses with CLOSED, or stays silent for `COUNT_TIMEOUT` (3000 ms) while connected and authenticated, is remembered as unsupported for the session and not asked again. A CLOSED with an `auth-required:` or `rate-limited:` reason, a dropped connection, or an abort resolves to `undefined` without that verdict.

`LOCAL_RELAY_URL` answers from the [repository](./repository).

### count(options)

Asks several relays in parallel and resolves to the highest answer, or `undefined` if none answered. Relays hold overlapping subsets of the network, so the result is a lower bound.

**Options:**
- `relays` - Array of relay URLs
- All other options from `countOne`

### supportsCount(relay)

`true` or `false` once the relay has answered or refused a COUNT, and `undefined` before.

## Example

```typescript
import {count} from "@welshman/net"

const total = await count({
  relays: ["wss://relay1.com", "wss://relay2.com"],
  filters: [{kinds: [7], "#e": [eventId]}],
  context,
})

if (total !== undefined) {
  console.log(`At least ${total} reactions`)
}
```
