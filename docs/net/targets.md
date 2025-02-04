# Targets

The targets system provides different strategies for message routing.
Each target type implements a common interface for handling nostr messages but with different routing behaviors.

## Overview

Targets are used by the [Executor](/net/executor.md) class to:
- Route messages to connections
- Handle responses
- Manage connection lifecycles
- Combine multiple routing strategies

## Available Targets

### Echo Target
Simple target that echoes messages back. Useful for testing.
```typescript
import {Echo} from '@welshman/net'

const echo = new Echo()
echo.on('EVENT', (url, event) => {
  console.log('Echo received:', event)
})
```

### Local Target
Connects to an in-memory relay implementation.
```typescript
import {Local} from '@welshman/net'
import {Repository, Relay} from '@welshman/util'

// Create local relay
const repository = new Repository()
const relay = new Relay(repository)
const local = new Local(relay)

// Use like any other target
local.send(['REQ', 'sub1', {kinds: [1]}])
```

### Relay Target
Single relay connection target.
```typescript
import {Relay} from '@welshman/net'

const target = new Relay(connection)
target.on('EVENT', (url, event) => {
  console.log(`Event from ${url}:`, event)
})
```

### Relays Target
Manages multiple relay connections.
```typescript
import {Relays} from '@welshman/net'

const target = new Relays([
  connection1,
  connection2,
  connection3
])
```

### Multi Target
Combines multiple targets into one.
```typescript
import {Multi, Local, Relays} from '@welshman/net'

// Create multi-target with local and remote relays
const target = new Multi([
  new Local(localRelay),
  new Relays(remoteConnections)
])
```

## Real World Example

Here's how Coracle might set up its relay infrastructure:

```typescript
import {
  Executor,
  Multi,
  Local,
  Relays
} from '@welshman/net'
import {Repository, Relay} from '@welshman/util'

// Setup
const setupRelayInfrastructure = () => {
  // Create local repository & relay
  const repository = new Repository()
  const localRelay = new Relay(repository)

  // Get remote connections from pool
  const remoteConnections = [
    pool.get("wss://relay1.example.com"),
    pool.get("wss://relay2.example.com")
  ]

  // Create multi-target executor
  const executor = new Executor(
    new Multi([
      // Local relay for immediate responses
      new Local(localRelay),

      // Remote relays for network queries
      new Relays(remoteConnections)
    ])
  )

  // Subscribe using combined target
  const sub = executor.subscribe(
    [{kinds: [1], limit: 10}],
    {
      onEvent: (url, event) => {
        if (url === LOCAL_RELAY_URL) {
          console.log('Got from cache:', event)
        } else {
          console.log('Got from network:', url, event)
        }
      }
    }
  )

  return {executor, sub}
}
```

The target system allows for flexible relay configurations while maintaining a consistent interface for the rest of the application. This is particularly useful for:
- Caching with local relays
- Load balancing across relays
- Fallback strategies
- Testing and simulation

Each target type serves a specific purpose but can be combined using `Multi` for complex routing scenarios.
