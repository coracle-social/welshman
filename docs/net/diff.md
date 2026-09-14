# Diff

Efficient event synchronization using NIP-77 Negentropy protocol.

## Core Classes

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

Fetch missing events after comparing with relays. Ids are requested in batches, newest first and a couple of batches at a time, so a caller watching events arrive sees recent ones before older ones.

**Returns:** Array of retrieved events.

### `push(options)`

Publish local events that relays are missing.

## Example

```typescript
// Check what events each relay has/needs
const results = await diff({
  relays: ['wss://relay1.com', 'wss://relay2.com'],
  filters: [{kinds: [1], authors: ['pubkey...']}],
  events: localEvents
})

// Pull events that relays have but we don't
const newEvents = await pull({
  relays: ['wss://relay1.com'],
  filters: [{kinds: [1]}],
  events: localEvents
})
```
