# Auth

Handles NIP-42 relay authentication flow.

## Core Classes

### `AuthState`

Manages authentication state for a socket connection.

**Status Values:**
- `AuthStatus.None` - No authentication required/attempted
- `AuthStatus.Requested` - Relay requested authentication
- `AuthStatus.PendingSignature` - Waiting for user to sign auth event
- `AuthStatus.DeniedSignature` - User denied signing
- `AuthStatus.PendingResponse` - Waiting for relay response
- `AuthStatus.Forbidden` - Authentication failed
- `AuthStatus.Ok` - Authentication successful

**Methods:**
- `doAuth(sign)` - Authenticate with the relay using provided signing function
- `attemptAuth(sign)` - Attempt authentication with timeout handling
- `retryAuth(sign)` - Retry authentication by resetting state and attempting auth again
- `cleanup()` - Clean up event listeners

**Events:**
- `AuthStateEvent.Status` - Emitted when authentication status changes

## Example

```typescript
const authState = new AuthState(socket)

// Listen for auth status changes
authState.on(AuthStateEvent.Status, (status) => {
  console.log('Auth status:', status)
})

// Attempt authentication when relay requests it
await authState.attemptAuth(async (template) => {
  return await signer.signEvent(template)
})

// Retry authentication if needed
await authState.retryAuth(async (template) => {
  return await signer.signEvent(template)
})
```
