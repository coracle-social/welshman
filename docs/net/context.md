# Context

A `NetContext` holds the instances a net call operates against:

- `pool?: Pool` - Socket connection pool
- `repository?: Repository` - Event storage and retrieval
- `getAdapter?: (url, context) => AbstractAdapter | undefined` - Custom adapter factory

## Supplying a context

Pass `context` to each `request`, `publish`, or `load` call. There is no default: a relay url throws without `context.pool`, and `LOCAL_RELAY_URL` throws without `context.repository`.

An `App` from `@welshman/app` owns one context per instance as `app.netContext`, so each identity gets its own pool and repository. `app.use(Network)` passes it for you.

## Example

```typescript
import type {NetContext} from '@welshman/net'
import {publish, request} from '@welshman/net'

const context: NetContext = {pool, repository, getAdapter}

await request({relays, filters, context})
await publish({event, relays, context})
```

With `@welshman/app`:

```typescript
await app.use(Network).request({relays, filters})
```
