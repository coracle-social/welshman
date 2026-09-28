# Policy

Socket policies attach automated behavior to a socket. A pool runs each policy in `pool.socketPolicies` once for every socket it creates.

## Types

### SocketPolicy
```typescript
type SocketPolicy = (socket: Socket) => Unsubscriber
```

A policy takes a socket and returns a cleanup function, which runs when the socket is cleaned up.

## Built-in Policies

### `socketPolicyAuthBuffer`

Buffers messages during the authentication flow and replays them after successful auth. The buffer holds 1000 messages. A subscription dropped from a full buffer is closed with a `CLOSED` that stands in for the relay's, and so is one still buffered when auth fails.

### `socketPolicyCancelUnsent`

Drops a `REQ` or `NEG-OPEN` from the send queue, along with its close, when the close is queued before the request was sent.

### `socketPolicyConnectOnSend`

Opens a closed socket when a message is sent, unless the socket errored in the last five seconds.

### `socketPolicyLifecycle`

Owns a socket's lifecycle. It closes sockets after 30 seconds of inactivity, and reopens ones that still have pending requests or publishes, backing off between attempts. On reopening it re-sends each request bounded at the outage, so a live subscription catches up on what it missed. A filter that names gift wraps reaches back two days further, since NIP-59 lets a wrap's timestamp sit up to two days in the past.

A socket that still has work outstanding but has heard nothing for 30 seconds is probed with a `REQ` the relay must answer. If nothing comes back within 10 seconds the socket is closed, which triggers the reconnect above. This catches a socket that reports itself open after its relay has gone, as happens when a device returns from suspend.

## Custom Auth Policy

### `makeSocketPolicyAuth(options)`

Creates a policy that answers authentication challenges.

**Options:**
- `sign: (event) => Promise<SignedEvent>` - Signing function
- `shouldAuth?: (socket) => boolean` - Optional auth condition

## Default Policies

`defaultSocketPolicies` includes all built-in policies except auth, which requires configuration. A new `Pool` copies it into `pool.socketPolicies`, so policies go on the pool before it creates any sockets. To enable automatic authentication on all connections:

```typescript
pool.socketPolicies = [
  ...defaultSocketPolicies,
  makeSocketPolicyAuth({
    sign: (event: StampedEvent) => signer.sign(event),
    shouldAuth: (socket: Socket) => true,
  }),
]
```

## Example

A custom policy is a function that returns a cleanup function:

```typescript
import {on} from "@welshman/lib"
import {SocketEvent, Socket, SocketStatus} from "@welshman/net"

const logStatusChangePolicy = (socket: Socket) =>
  on(socket, SocketEvent.Status, (newStatus: SocketStatus) => {
    console.log(socket.url, newStatus)
  })
```
