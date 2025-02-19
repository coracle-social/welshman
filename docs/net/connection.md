# Connection

The `Connection` class is the core building block for relay communication in `@welshman/net`. It manages the complete lifecycle of a relay connection, including socket handling, message queuing, authentication, and statistics tracking.

## Overview

A Connection handles:
- WebSocket lifecycle
- Message queuing and throttling
- Connection state tracking
- Relay authentication
- Connection statistics

## Basic Usage

```typescript
import {Connection} from '@welshman/net'

// Create connection
const connection = new Connection("wss://relay.example.com")

// Listen for events
connection.on('event', (conn, subId, event) => {
  console.log(`Got event from ${conn.url}`)
})

// Send a subscription
connection.send(["REQ", "my-sub", {kinds: [1], limit: 10}])

// Clean up when done
connection.cleanup()
```

## Handling Authentication

The `connection.open()` promise resolves when the WebSocket connection is fully established and ready for communication.
However, it's important to understand the authentication flow:

```typescript
import {Connection} from '@welshman/net'

const connection = new Connection("wss://relay.example.com")

// Basic open
await connection.open()
// Promise resolves when WebSocket is connected
// BUT might not be auth-ready yet!

// Complete open with auth handling
const openRelay = async (url: string) => {
  const connection = new Connection(url)

  // Open socket
  await connection.open()

  // Check if relay requires auth
  if (connection.auth.status === 'requested') {
    try {
      // Handle auth challenge
      await connection.auth.attempt(3000) // 3s timeout
    } catch (e) {
      console.error('Auth failed:', e)
      return null
    }
  }

  // NOW connection is fully ready
  return connection
}
```

The key states after `open()` resolves:
- Socket is connected
- Messages can be queued
- BUT relay might request authentication
- AND authentication might fail

Always check `connection.auth.status` if you need to ensure the connection is fully authenticated before use.
