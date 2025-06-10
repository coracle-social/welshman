# Message

Type definitions and utilities for Nostr protocol messages.

## Relay Message Types

**Enums:**
- `RelayMessageType.Auth` - Authentication challenge
- `RelayMessageType.Closed` - Subscription closed
- `RelayMessageType.Eose` - End of stored events
- `RelayMessageType.Event` - Event data
- `RelayMessageType.NegErr` - Negentropy error
- `RelayMessageType.NegMsg` - Negentropy message
- `RelayMessageType.Ok` - Command result

**Type Definitions:**
- `RelayMessage` - Base relay message type
- `RelayAuth`, `RelayClosed`, `RelayEose`, `RelayEvent`, `RelayNegErr`, `RelayNegMsg`, `RelayOk` - Specific message types
- `RelayAuthPayload`, `RelayClosedPayload`, etc. - Payload types for each message

**Type Guards:**
- `isRelayAuth()`, `isRelayClosed()`, `isRelayEose()`, `isRelayEvent()`, `isRelayNegErr()`, `isRelayNegMsg()`, `isRelayOk()`

## Client Message Types

**Enums:**
- `ClientMessageType.Auth` - Authentication response
- `ClientMessageType.Close` - Close subscription
- `ClientMessageType.Event` - Publish event
- `ClientMessageType.NegClose` - Close negentropy
- `ClientMessageType.NegOpen` - Open negentropy
- `ClientMessageType.Req` - Request subscription

**Type Definitions:**
- `ClientMessage` - Base client message type
- `ClientAuth`, `ClientClose`, `ClientEvent`, `ClientNegClose`, `ClientNegOpen`, `ClientReq` - Specific message types
- `ClientAuthPayload`, `ClientClosePayload`, etc. - Payload types for each message

**Type Guards:**
- `isClientAuth()`, `isClientClose()`, `isClientEvent()`, `isClientNegClose()`, `isClientNegOpen()`, `isClientReq()`

## Example

```typescript
// Handle incoming relay message
const handleMessage = (message: RelayMessage) => {
  if (isRelayEvent(message)) {
    const [type, subId, event] = message
    console.log('Event:', event.id)
  }
}
```
