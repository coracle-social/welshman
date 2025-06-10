# Socket

WebSocket wrapper for Nostr relay connections with status tracking, queuing, and authentication support. Not intended to be used directly, instead access sockets through the `Pool` interface.

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

WebSocket connection to a Nostr relay with queuing and authentication.

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

## Example

```typescript
import {Socket, SocketEvent, SocketStatus} from "@welshman/net"

const socket = new Socket("wss://relay.example.com")

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
