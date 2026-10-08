# The App

An `App` is an application instance. It owns every piece of per-identity state and is the entry point to all features, which are reached through `app.use(...)`.

## Creating an app

### `createApp(options?)`

Returns an `App` wired with the [default policies](#default-policies), unless `policies` is passed.

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

The constructor installs no policies unless they are passed, which suits tests and apps that install their own.

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
  policies?: AppPolicy[]               // side effects to install at construction
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

Plugins and policies depend on the `IApp` interface rather than the `App` class:

```typescript
interface IApp {
  user?: User
  config: AppConfig
  use: <T>(Ctor: Plugin<T>) => T
  onCleanup: (unsubscriber: Unsubscriber) => void
  netContext: NetContext               // {pool, repository, getAdapter} for the net layer
  pool: Pool                           // connection pool
  tracker: Tracker                     // tracks which relays have seen each event
  repository: Repository               // the local event store / single source of truth
  wrapManager: WrapManager             // NIP-59 gift-wrap bookkeeping
}
```

## Resolving features: `use`

```typescript
type Plugin<T> = new (app: IApp) => T

use: <T>(Ctor: Plugin<T>) => T
```

The first call with a plugin class constructs `new Ctor(app)` and caches it. Later calls return the same instance.

```typescript
const profiles = app.use(Profiles)
const sameInstance = app.use(Profiles)   // identical reference
```

Plugins reach their own dependencies the same way (`this.app.use(Network)`), so there is no constructor wiring.

## Teardown: `cleanup`

```typescript
app.cleanup()
```

`cleanup()` runs every registered teardown in reverse registration order, then clears the `pool`, `tracker`, `repository`, and `wrapManager`. The order matters for teardowns that restore something they replaced: `appPolicyCacheDecrypt` and `appPolicyLogSignerMethods` both wrap `user.signer`, and each unwraps in the opposite order it wrapped.

A plugin that owns a resource the app can't see, such as a queue, a timer, or an outside subscription, registers its own teardown with `onCleanup`:

```typescript
class MyPlugin {
  queue = new TaskQueue({...})

  constructor(readonly app: IApp) {
    app.onCleanup(() => this.queue.clear())
  }
}
```

## Policies

A **policy** is a side effect. It runs once at construction and returns an `Unsubscriber` that `cleanup()` calls. Policies own every subscription, so the data plugins stay free of them.

```typescript
type AppPolicy = (app: IApp) => Unsubscriber
```

### Default policies

`createApp` installs `defaultAppPolicies`:

| Policy | What it does |
|---|---|
| `appPolicyIngest` | Verifies events received on any socket (skipping DVM and ephemeral kinds) and writes them to the `repository` and `tracker`, which populates every repository-backed store. |
| `appPolicyRelayStats` | Pipes socket activity into the [`RelayStats`](./routing#relay-quality) store. |
| `appPolicyNotify` | Pipes `NOTIFY` messages into the [`Notify`](./data#relay-notifications) store. |
| `appPolicyWraps` | Enqueues existing and newly-arriving gift-wrap events for unwrapping. |
| `appPolicyCacheDecrypt` | Wraps the user's signer so NIP-04/NIP-44 decryption consults the `Plaintext` cache before doing real work. No-op when there is no user. |
| `appPolicyLogSignerMethods` | Wraps the user's signer to log every call to the [`Logger`](#logging). No-op when there is no user. |
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

A `policies` array replaces the defaults:

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

The `Logger` plugin keeps an in-memory log of the most recent 1000 entries. `log(source, {...})` appends an entry, and the `messages` projection reads them back.

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

logger.messages.$.subscribe(messages => {
  for (const msg of messages) {
    if (msg.source === "signer" && msg.status === "failure") {
      console.error("signing failed", msg.method, msg.error)
    }
  }
})
```

`appPolicyLogSignerMethods` logs a `"signer"` message for every signer call, with `method` and a `status` of `"pending"`, then `"success"` or `"failure"` (with `error`).
