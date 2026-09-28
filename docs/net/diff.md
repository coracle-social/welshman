# Diff

Event synchronization using the NIP-77 negentropy protocol.

## Classes

### `Difference`

Handles negentropy synchronization with a single relay for a single filter.

**Events:**
- `DifferenceEvent.Message` - Emitted with `{have, need}` arrays and relay URL
- `DifferenceEvent.Error` - Emitted when sync fails
- `DifferenceEvent.Close` - Emitted when sync completes

**Methods:**
- `close()` - Stop synchronization and cleanup

## Functions

### `diff(options)`

Check what events each relay has or needs compared to local events.

**Returns:** Array of `{relay, have, need}` objects - `have` are events you have that the relay doesn't, `need` are events the relay has that you don't.

### `pull(options)`

Fetch the events relays have that you don't. Ids are requested in batches of 100, two batches at a time per relay, newest batch first.

**Returns:** Array of retrieved events.

### `push(options)`

Publish local events that relays are missing.

All three take `{relays, filters, events, signal?, context?}`.

## Example

```typescript
import {diff, pull} from '@welshman/net'

const results = await diff({
  relays: ['wss://relay1.com', 'wss://relay2.com'],
  filters: [{kinds: [1], authors: ['pubkey...']}],
  events: localEvents,
  context,
})

const newEvents = await pull({
  relays: ['wss://relay1.com'],
  filters: [{kinds: [1]}],
  events: localEvents,
  context,
})
```
