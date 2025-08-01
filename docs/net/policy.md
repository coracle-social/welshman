# Policy

Socket policies provide automated behavior for socket connections. They are intended to be applied on socket creation via `makeSocket` or `PoolOptions.makeSocket`.

## Types

### SocketPolicy
```typescript
type SocketPolicy = (socket: Socket) => Unsubscriber
```

The contract for socket policies. Takes a Socket object and returns a cleanup function that should be called when the policy is no longer needed.

## Built-in Policies

### `socketPolicyAuthBuffer`

Buffers messages during authentication flow and replays them after successful auth.

### `socketPolicyConnectOnSend`

Auto-connects closed sockets when messages are sent (with error cooldown).

### `socketPolicyCloseOnTimeout`

Closes sockets after 30 seconds of inactivity.

### `socketPolicyReopenActive`

Reopens sockets that have pending requests or publishes.

## Custom Auth Policy

### `makeSocketPolicyAuth(options)`

Creates a policy that handles authentication challenges.

**Options:**
- `sign: (event) => Promise<SignedEvent>` - Signing function
- `shouldAuth?: (socket) => boolean` - Optional auth condition

## Default Policies

`defaultSocketPolicies` includes all built-in policies except auth (which requires configuration).

It's common to include the following code in order to enable automatic authentication on all connections:

```typescript
defaultSocketPolicies.push(
  makeSocketPolicyAuth({
    sign: (event: StampedEvent) => signer.sign(event),
    shouldAuth: (socket: Socket) => true,
  }),
)
```

## Example

It's possible to create custom policies simply by defining a function which returns a cleanup function:

```typescript
import {on} from "@welshman/lib"
import {SocketEvent, Socket, SocketStatus} from "@welshman/net"

const logStatusChangePolicy = (socket: Socket) => {
  const unsubscribe = on(socket, SocketEvent.Status, (newStatus: SocketStatus) => {
    console.log(socket.url, newStatus)
  })

  return unsubscribe
}
```
