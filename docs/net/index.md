# @welshman/net

Core networking layer for nostr applications, handling relay connections, message management, and event delivery.

## Who is it for?

- Developers needing low-level nostr networking
- Applications managing custom relay connections
- Projects requiring fine-grained subscription control
- Anyone building relay-aware nostr tools

## Core Systems

### [Context](./context.md)
- Global network configuration

### [Executor](./executor.md)
- Message execution
- Target management
- Event routing
- Subscription handling

### [Subscribe](./subscribe.md)
- Subscription management
- Event filtering
- EOSE handling
- Connection sharing

### [Publish](./publish.md)
- Event publishing
- Status tracking
- Relay selection
- Error handling

### [Sync](./sync.md)
- Event synchronization
- NIP-77 (negentropy)
- Repository syncing
- Relay consistency

### [Pool](./pool.md)
- Connection pooling
- Relay management
- Connection reuse
- State tracking

### [Targets](./targets.md)
- Message routing
- Single or multi relay connection
- Local relay support

### [Connection](./connection.md)
- WebSocket management
- Connection state tracking
- Message queuing
- Error handling

### [Socket](./socket.md)
- Optimized socket implementation
- Built-in Nostr parsing

Each system provides low-level building blocks that can be composed for different networking needs.
The package is framework-agnostic and focuses purely on nostr networking concerns.
