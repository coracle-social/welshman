# Throttled Store

Utility for wrapping Svelte stores to throttle subscriber notifications, reducing update frequency for performance.

## Functions

### throttled(delay, store)

Creates a throttled version of a store that limits how often subscribers are notified.

**Parameters:**
- `delay` - Throttle delay in milliseconds (0 disables throttling)
- `store` - Any readable Svelte store

**Returns:** Store with throttled subscription behavior

When `delay` is 0, returns the original store unchanged. Otherwise, wraps the store so that subscribers receive updates at most once per delay period.

## Example

```typescript
import {writable} from "svelte/store"
import {throttled} from "@welshman/store"

// Create a regular store that updates frequently
const fastStore = writable(0)

// Create a throttled version that only notifies every 100ms
const slowStore = throttled(100, fastStore)

// Subscribe to both stores
fastStore.subscribe(value => console.log("Fast:", value))
slowStore.subscribe(value => console.log("Slow:", value))

// Rapidly update the store
let count = 0
const interval = setInterval(() => {
  fastStore.set(++count)

  if (count >= 10) {
    clearInterval(interval)
  }
}, 10) // Update every 10ms

// Output:
// Fast: 1, Fast: 2, Fast: 3, ... (every update)
// Slow: 1, Slow: 5, Slow: 10 (throttled to ~100ms intervals)
```
