# Pool

The Pool class manages a collection of websocket connections to relay servers, providing connection pooling and lifecycle management.

## Classes

### Pool

A connection pool that creates and manages Socket instances for different relay URLs.

**Methods:**
- `static get()` - Returns the singleton pool instance
- `has(url)` - Checks if a socket exists for the given URL
- `get(url)` - Gets or creates a socket for the given URL
- `subscribe(callback)` - Subscribes to new socket creation events
- `remove(url)` - Removes and cleans up a socket
- `clear()` - Removes all sockets from the pool

## Functions

### makeSocket(url, policies)

Creates a new Socket instance with the given URL and applies default policies.

## Example

```typescript
import {Pool} from "@welshman/net"

// Get the singleton - Pool can also be instantiated directly if you want multiple pools
const pool = Pool.get()

// Get a socket for a relay
const socket = pool.get("wss://relay.example.com")

// Subscribe to new socket creation
const unsubscribe = pool.subscribe((socket) => {
  console.log("New socket created:", socket.url)
})

// Clean up
pool.remove("wss://relay.example.com")
```
