# Context

Provides global configuration and dependencies for the net package.

## NetContext

Configuration object that defines how the net package operates:

- `pool: Pool` - Socket connection pool
- `repository: Repository` - Event storage and retrieval
- `isEventValid: (event, url) => boolean` - Event validation function
- `isEventDeleted: (event, url) => boolean` - Event deletion check
- `getAdapter?: (url, context) => AbstractAdapter` - Custom adapter factory

## Default Context

The `netContext` global provides sensible defaults:

- Uses singleton pool and repository instances
- Validates events using `verifyEvent`
- Checks deletions via repository
- No custom adapter factory

## Example

```typescript
import {netContext} from '@welshman/net'

// Override event validation
netContext.isEventValid: (event, url) => {
  return event.kind < 30000 && verifyEvent(event)
}

// Use in requests
request({
  filters: [{kinds: [1]}],
  relays: ['wss://relay.example.com'],
  context: {
    ...netContext,
    // Request-specific overrides
  }
})
```
