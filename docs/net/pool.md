# Pool

`Pool` manages a collection of websocket connections to relays, creating one `Socket` per normalized relay url.

## Pool

**Properties:**
- `socketPolicies` - The policies applied to each socket the pool creates, copied from `defaultSocketPolicies` at construction

**Methods:**
- `has(url)` - Checks if a socket exists for the given URL
- `get(url)` - Gets or creates a socket for the given URL
- `subscribe(callback)` - Subscribes to new socket creation events; returns an unsubscriber
- `remove(url)` - Removes and cleans up a socket
- `clear()` - Removes all sockets from the pool

## Example

```typescript
import {Pool} from "@welshman/net"

const pool = new Pool()

const socket = pool.get("wss://relay.example.com")

const unsubscribe = pool.subscribe((socket) => {
  console.log("New socket created:", socket.url)
})

pool.remove("wss://relay.example.com")
```
