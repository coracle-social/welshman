# Context

Provides the configuration and dependencies each net call operates against.

## NetContext

Configuration object that defines how the net package operates:

- `pool?: Pool` - Socket connection pool
- `repository?: Repository` - Event storage and retrieval
- `getAdapter?: (url, context) => AbstractAdapter | undefined` - Custom adapter factory

## Supplying a context

Pass `context` to each `request`, `publish`, or `load` call. An `App` from `@welshman/app` owns one
per instance as `app.netContext`, and `app.use(Network)` supplies it automatically — so each
identity gets its own pool and repository, and data never bleeds between sessions.
- Checks deletions via repository
- No custom adapter factory

## Example

```typescript
import type {NetContext} from '@welshman/net'
import {publish, request} from '@welshman/net'

const context: NetContext = {pool, repository, getAdapter}

await request({relays, filters, context})
await publish({event, relays, context})
```

With `@welshman/app`, `app.use(Network)` passes `app.netContext` for you:

```typescript
await app.use(Network).request({relays, filters})
```
