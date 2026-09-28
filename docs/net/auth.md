# Auth

`AuthState` tracks the NIP-42 authentication flow for one socket. Every socket carries one as `socket.auth`.

## AuthState

**Status Values:**
- `AuthStatus.None` - No authentication required/attempted
- `AuthStatus.Requested` - Relay requested authentication
- `AuthStatus.PendingSignature` - Waiting for user to sign auth event
- `AuthStatus.DeniedSignature` - User denied signing
- `AuthStatus.PendingResponse` - Waiting for relay response
- `AuthStatus.Forbidden` - Authentication failed
- `AuthStatus.Ok` - Authentication successful

**Methods:**
- `doAuth(sign)` - Signs and sends a response to the current challenge
- `attemptAuth(sign)` - Opens the socket, waits up to a second for a challenge, answers it, and waits up to three seconds for the relay's response
- `retryAuth(sign)` - Resets the current challenge to `Requested` and calls `attemptAuth` again
- `cleanup()` - Removes event listeners

**Events:**
- `AuthStateEvent.Status` - Emitted when authentication status changes

## Example

```typescript
import {AuthStateEvent} from '@welshman/net'

socket.auth.on(AuthStateEvent.Status, (status) => {
  console.log('Auth status:', status)
})

await socket.auth.attemptAuth(template => signer.sign(template))

await socket.auth.retryAuth(template => signer.sign(template))
```
