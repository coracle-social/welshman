# Socket
The Socket class is exclusively used by the `Connection` class as its low-level WebSocket manager. It's not meant to be used directly by other classes.
Its sole purpose is to provide a reliable, manageable WebSocket connection with nostr-specific handling.

## Core Responsibilities

```typescript
export class Socket {
  // Track connection state
  status: SocketStatus = "new" | "open" | "opening" | "closing" | "closed" | "error"

  // Handle nostr message queue
  worker: Worker<Message>

  // Core operations
  open = async () => {/* Initialize WebSocket */}
  close = async () => {/* Clean shutdown */}
  send = async (message: Message) => {/* Send with JSON serialization */}
}
```

Key features:
- State tracking
- Message queuing
- JSON serialization
- Error recovery
- Connection lifecycle

Think of it as a thin wrapper that turns raw WebSocket connections into something more suitable for nostr:
```typescript
// Raw WebSocket
ws.send(JSON.stringify(["REQ", "sub1", {kinds: [1]}]))

// With Socket
socket.send(["REQ", "sub1", {kinds: [1]}]) // Handles serialization
```

## Usage Chain

```typescript
// Hierarchy
Socket                    // WebSocket management
  ↳ Connection           // Uses Socket
    ↳ Relay Target      // Uses Connection
      ↳ Executor       // Uses Target
        ↳ Subscribe   // Uses Executor
        ↳ Publish    // Uses Executor

// In Connection.ts
export class Connection extends Emitter {
  socket: Socket

  constructor(url: string) {
    this.socket = new Socket(this)
  }
}
```

It's an internal implementation detail that you shouldn't need to use directly - always interact with the `Connection` class instead, which provides a higher-level interface.

```typescript
// DON'T use Socket directly
const socket = new Socket(/*...*/) // ❌

// DO use Connection
const connection = new Connection(url) // ✅
```

This encapsulation ensures consistent connection management across the library.
