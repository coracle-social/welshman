# The App

An `App` is an application instance. It owns every piece of per-identity state and is the entry point to all features. You will usually create one with `createApp` and access everything else through `app.use(...)`.

## Creating an app

### `createApp(options?)`

The batteries-included factory. It returns an `App` wired with the [default policies](#policies) (event ingestion, relay-stats collection, gift-wrap unwrapping, decrypt caching, signer-method logging, and NIP-42 auth) unless you pass your own `policies`.

```typescript
import {createApp} from "@welshman/app"

const app = createApp({
  user,                                  // optional signed-in User
  config: {
    dufflepudUrl: "https://dufflepud.example",
    getDefaultRelays: () => ["wss://relay.example"],
    getIndexerRelays: () => ["wss://purplepag.es"],
    getSearchRelays: () => ["wss://relay.nostr.band"],
  },
})
```

### `new App(options?)`

Use the constructor directly when you want a bare app with **no** side effects (for example in tests, or when you install policies yourself).

```typescript
import {App} from "@welshman/app"

const app = new App()              // no policies installed
```

## `AppOptions`

```typescript
type AppOptions = {
  user?: User                          // the signed-in identity (at most one)
  config?: AppConfig
  getAdapter?: AdapterFactory          // net-layer adapter factory
  policies?: AppPolicy[]            // side effects to install at construction
}
```

## `AppConfig`

App-level configuration. All fields are optional; the three relay getters return `string[]` and feed the [Router](./routing).

```typescript
type AppConfig = {
  dufflepudUrl?: string                // optional dufflepud service (batches NIP-05 / zapper lookups)
  getDefaultRelays?: () => string[]
  getIndexerRelays?: () => string[]    // relays used to discover relay lists / profiles
  getSearchRelays?: () => string[]     // NIP-50 search relays
}
```

## `IApp`

Plugins and policies never depend on the concrete `App` class — they take the `IApp` contract:

```typescript
interface IApp {
  user?: User
  config: AppConfig
  use: <T>(Ctor: new (app: IApp) => T) => T
  netContext: NetContext               // {pool, repository, getAdapter} for the net layer
  pool: Pool                           // connection pool
  tracker: Tracker                     // tracks which relays have seen each event
  repository: Repository               // the local event store / single source of truth
  wrapManager: WrapManager             // NIP-59 gift-wrap bookkeeping
}
```

Every primitive (`pool`, `tracker`, `repository`, `wrapManager`) is constructed fresh per instance, so data never bleeds across identities or sessions.

## Resolving features: `use`

```typescript
use: <T>(Ctor: new (app: IApp) => T) => T
```

`use` is a per-app singleton resolver. The first time you pass a plugin class, the app constructs `new Ctor(this)` and caches it; subsequent calls return the same instance.

```typescript
const profiles = app.use(Profiles)
const sameInstance = app.use(Profiles)   // identical reference
```

This is dependency resolution by demand. Plugins reach their own dependencies the same way (`this.app.use(Network)`, `this.app.use(Router)`), which means dependency cycles resolve lazily and there is no constructor wiring to maintain.

## Teardown: `cleanup`

```typescript
app.cleanup()
```

`cleanup()` runs every registered teardown function, then clears the `pool`, `tracker`, `repository`, and `wrapManager`. Call it when you discard an app (e.g. switching identities) to release connections and free memory.

Teardowns run in reverse registration order, since ones that restore something they replaced only compose LIFO — `appPolicyCacheDecrypt` and `appPolicyLogSignerMethods` both wrap `user.signer`, and each has to unwrap in the opposite order it wrapped.

A plugin that owns a resource the app can't see — a queue, a timer, a subscription to something outside the app — registers its own teardown with `onCleanup`:

```typescript
class MyPlugin {
  queue = new TaskQueue({...})

  constructor(readonly app: IApp) {
    app.onCleanup(() => this.queue.clear())
  }
}
```

## Policies

A **policy** is the unit of side effects. It runs once at construction and returns an `Unsubscriber` that `cleanup()` will later call. Keeping side effects in policies leaves the data plugins pure and centralizes teardown.

```typescript
type AppPolicy = (app: IApp) => Unsubscriber
```

### Default policies

`createApp` installs `defaultAppPolicies`:

| Policy | What it does |
|---|---|
| `appPolicyIngest` | Subscribes to the pool; verifies inbound relay events (skipping DVM/ephemeral kinds) and writes them to the `repository` and `tracker`. This is how every repository-backed store gets populated. |
| `appPolicyRelayStats` | Pipes socket activity into the [`RelayStats`](./routing#relay-quality) store. |
| `appPolicyWraps` | Enqueues existing and newly-arriving gift-wrap events for unwrapping. |
| `appPolicyCacheDecrypt` | Wraps the user's signer so NIP-04/NIP-44 decryption consults the `Plaintext` cache before doing real work. No-op when there is no user. |
| `appPolicyLogSignerMethods` | Wraps the user's signer to log every signer call (pending → success/failure) to the [`Logger`](#logging) plugin. No-op when there is no user. |
| `appPolicyAuthUnlessBlocked` | Answers NIP-42 AUTH challenges, except for relays in the user's blocked-relay list. |

### Auth policy builders

```typescript
makeAppPolicyAuth(shouldAuth: (socket: Socket, app: IApp) => boolean): AppPolicy

appPolicyAuthNever            // never answer AUTH
appPolicyAuthAlways           // always answer AUTH
appPolicyAuthUnlessBlocked    // answer unless the relay is blocked by the user
```

Auth policies are no-ops when there is no signed-in user.

### Customizing policies

Pass your own `policies` array to opt out of, or extend, the defaults:

```typescript
import type {AppPolicy} from "@welshman/app"
import {App, defaultAppPolicies} from "@welshman/app"

const myPolicy: AppPolicy = app =>
  app.pool.subscribe(socket => {
    // ...install a side effect, return an Unsubscriber
    return () => {}
  })

const app = new App({
  user,
  policies: [...defaultAppPolicies, myPolicy],
})
```

## Logging

`@welshman/app` exposes a durable, in-app log through the `Logger` plugin. Resolve it with `app.use(Logger)`, append entries with `log(source, {...})`, and subscribe to the `messages` store (a projection) to read them back. The store keeps the most recent 1000 entries.

```typescript
type LogMessage = {
  source: string
  id: string          // defaults to a random id
  at: number          // defaults to Date.now()
  [key: string]: unknown
}
```

```typescript
import {Logger} from "@welshman/app"

const logger = app.use(Logger)

logger.log("my-feature", {status: "ok"})

logger.messages.subscribe(messages => {
  for (const msg of messages) {
    if (msg.source === "signer" && msg.status === "failure") {
      console.error("signing failed", msg.method, msg.error)
    }
  }
})
```

Signer operations are logged automatically by the default `appPolicyLogSignerMethods` policy, which wraps the user's signer (via `User.wrapSigner`) and emits a `"signer"` message with `method` and `status` (`"pending"` → `"success"` / `"failure"`, with `error` on failure) for every signer call. It is a no-op when there is no signed-in user.
