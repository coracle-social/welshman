# The App

An `App` is an application instance. It owns every piece of per-identity state and is the entry point to all features. You will usually create one with `createApp` and access everything else through `app.use(...)`.

## Creating an app

### `createApp(options?)`

The batteries-included factory. It returns an `App` wired with the [default policies](#policies) (event ingestion, relay-stats collection, gift-wrap unwrapping, and NIP-42 auth) unless you pass your own `policies`.

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

`cleanup()` runs every policy's unsubscribe function, then clears the `pool`, `tracker`, `repository`, and `wrapManager`. Call it when you discard an app (e.g. switching identities) to release connections and free memory.

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
import {App, defaultAppPolicies, makeAppPolicyLogger} from "@welshman/app"

const app = new App({
  user,
  policies: [
    ...defaultAppPolicies,
    makeAppPolicyLogger(msg => console.log(msg)),   // see Logging
  ],
})
```

## Logging

`@welshman/app` can make a user's signer observable. `User.fromSigner`/`User.fromSession` wrap the underlying signer in a `LoggingSigner`, which emits a structured `LogMessage` for every signer operation (pending → success/failure).

```typescript
type LogMessage =
  | {type: "signer"; id: string; method: string; status: "pending" | "success" | "failure"; error?: unknown; at: number}
  | {type: string; at: number; [key: string]: unknown}
```

Forward those messages by installing `makeAppPolicyLogger`:

```typescript
import {makeAppPolicyLogger} from "@welshman/app"

const app = new App({
  user,
  policies: [...defaultAppPolicies, makeAppPolicyLogger(msg => {
    if (msg.type === "signer" && msg.status === "failure") {
      console.error("signing failed", msg.method, msg.error)
    }
  })],
})
```

The logger policy is a no-op unless the user's signer is a `LoggingSigner` (which it is when the user was created via `User.fromSigner`/`User.fromSession`).
