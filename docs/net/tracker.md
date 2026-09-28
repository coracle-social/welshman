# Tracker

`Tracker` records which relays have sent or accepted each event, as a two-way map between event ids and relay urls. `request` uses one to detect events that arrive from more than one relay, and an [`App`](../app/app#iapp) owns one as `app.tracker`.

## Tracker

**Properties:**
- `relaysById` - `Map<string, Set<string>>` from event id to relay urls
- `idsByRelay` - `Map<string, Set<string>>` from relay url to event ids

**Events:**
- `"add"` - Emitted with `(eventId, relay)` when a new pair is recorded
- `"remove"` - Emitted with `(eventId, relay)` when a pair is removed
- `"load"` - Emitted by `load()`
- `"clear"` - Emitted by `clear()`

**Methods:**
- `track(eventId, relay)` - Records the pair and returns whether the event had been seen from any relay before
- `addRelay(eventId, relay)` / `removeRelay(eventId, relay)` - Records or removes one pair
- `hasRelay(eventId, relay)` - Whether the pair is recorded
- `getRelays(eventId)` - The relays recorded for an event
- `getIds(relay)` - The events recorded for a relay
- `copy(eventId1, eventId2)` - Records every relay of the first event for the second, as `WrapManager` does from a gift wrap to its rumor
- `load(relaysById)` - Adds a `Map<string, Set<string>>` of pairs to those already recorded. Call `clear()` first to replace them
- `clear()` - Removes every pair

`load` emits only `"load"`, not an `"add"` per pair.

## Example

```typescript
import {Tracker, request} from "@welshman/net"

const tracker = new Tracker()

await request({
  relays: ["wss://relay1.com", "wss://relay2.com"],
  filters: [{kinds: [1], limit: 10}],
  autoClose: true,
  tracker,
  context,
})

for (const id of tracker.getIds("wss://relay1.com")) {
  console.log(id, "also on", Array.from(tracker.getRelays(id)))
}
```
