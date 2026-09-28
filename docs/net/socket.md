# Socket

`Socket` wraps a websocket connection to a relay with status tracking, send and receive queues, and NIP-42 auth state. Sockets are obtained from a `Pool` rather than constructed directly.

## Enums

### SocketStatus

Connection status values:
- `Open` - Socket is connected and ready
- `Opening` - Socket is connecting
- `Closing` - Socket is closing
- `Closed` - Socket is closed
- `Error` - Socket encountered an error

### SocketEvent

Event types emitted by the socket:
- `Error` - Socket error occurred
- `Status` - Status changed
- `Send` - Message sent to relay
- `Sending` - Message queued for sending
- `Receive` - Message received from relay
- `Receiving` - Message queued for processing

## Classes

### Socket

**Properties:**
- `url` - Relay URL
- `status` - Current socket status
- `auth` - Authentication state

**Methods:**
- `open()` - Opens the WebSocket connection
- `attemptToOpen()` - Opens connection if not already open
- `close()` - Closes the connection
- `cleanup()` - Closes connection and removes all listeners
- `send(message)` - Queues a message to send
- `receive(message)` - Queues a message from the relay for processing

## Example

```typescript
import {Pool, SocketEvent} from "@welshman/net"

const socket = new Pool().get("wss://relay.example.com")

socket.on(SocketEvent.Status, (status, url) => {
  console.log(`Socket ${url} status: ${status}`)
})

socket.on(SocketEvent.Receive, (message, url) => {
  console.log("Received:", message)
})

socket.open()
socket.send(["REQ", "sub-id", {kinds: [1], limit: 10}])
socket.cleanup()
```
