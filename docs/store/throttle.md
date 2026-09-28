# Throttled Store

Wraps a Svelte store to throttle subscriber notifications.

## Functions

### throttled(delay, store)

**Parameters:**
- `delay` - Throttle delay in milliseconds
- `store` - Any readable Svelte store

When `delay` is 0, `throttled` returns the original store. Otherwise subscribers receive updates at most once per `delay`.

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

// Fast logs every value from 0 to 10
// Slow logs 0, then the latest value at most once per 100ms
```
