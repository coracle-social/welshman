# WrapManager

`WrapManager` records which NIP-59 gift wraps carry which rumors. The rumor itself lives in a [`Repository`](./repository), and the wrap is kept as a `WrapItem`, without its encrypted content. An [`App`](../app/app#iapp) owns one as `app.wrapManager`, and its publisher registers each gift wrap it sends.

## WrapManager

```typescript
new WrapManager({repository, tracker})

type WrapItem = Omit<HashedEvent, "content"> & {
  rumorId: string
  recipient: string
}
```

**Events:**
- `"add"` - Emitted with the `WrapItem` by `add()`
- `"remove"` - Emitted with the `WrapItem` by `remove()`
- `"load"` - Emitted by `load()` and by `clear()`

**Methods:**
- `add({wrap, rumor, recipient})` - Records the wrap, publishes the rumor to the repository, and copies the wrap's relays in the tracker onto the rumor
- `getRumor(wrapId)` - The rumor a wrap carries, read from the repository
- `getWraps(rumorId)` - The `WrapItem`s carrying a rumor
- `remove(wrapId)` - Forgets the wrap and removes its rumor from the repository
- `removeByRumorId(rumorId)` - Removes every wrap carrying a rumor
- `dump()` - Every `WrapItem`, for persistence
- `load(wrapItems)` - Replaces the recorded wraps. Unlike `Repository` and `Tracker`, it clears existing state first, and it does not touch the repository
- `clear()` - Forgets every wrap

## Example

```typescript
import {Repository, Tracker, WrapManager} from "@welshman/net"

const repository = new Repository()
const tracker = new Tracker()
const wrapManager = new WrapManager({repository, tracker})

wrapManager.add({wrap, rumor, recipient: pubkey})

wrapManager.getRumor(wrap.id) // the rumor, from the repository

wrapManager.load(storedWrapItems)
```
