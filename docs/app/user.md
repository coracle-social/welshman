# User & Sessions

An `App` is centered on at most one identity, a `User`. Persisted login state is a separate, serializable `Session`, and session handlers turn a session back into a live signer.

## `User`

A `User` is a single identity: a `pubkey` plus the `signer` that proves ownership of it.

```typescript
class User {
  constructor(readonly pubkey: string, public signer: ISigner)

  static fromSigner(signer: ISigner): Promise<User>
  static fromSession(session: Session): Promise<User | undefined>
  static require(app: IApp): User

  sign(event: StampedEvent, options?: SignerOptions): Promise<SignedEvent>
  nip44EncryptToSelf(payload: string): Promise<string>
  wrapSigner(wrap: SignerMethodWrapper): () => void
}
```

### Constructing a user

- **`User.fromSigner(signer)`** reads the pubkey from `signer.getPubkey()` and returns the `User`.
- **`User.fromSession(session)`** builds a signer through the [handler registry](#session-handlers) and returns the `User`, or `undefined` if no handler is registered for the session's method.

```typescript
import {User} from "@welshman/app"
import {Nip07Signer} from "@welshman/signer"

const user = await User.fromSigner(new Nip07Signer())
```

### Gating user-only actions

`User.require(app)` returns `app.user`, and throws `"This action requires a signed-in user"` if there is none. Plugins call it before signing or encrypting.

```typescript
const user = User.require(app)
const signed = await user.sign(stampedEvent)
```

### Signing & self-encryption

- **`sign(event)`** delegates to the signer.
- **`nip44EncryptToSelf(payload)`** encrypts a payload to the user's own pubkey with NIP-44.
- **`wrapSigner(wrap)`** replaces `signer` with a `WrappedSigner` around it and returns a function that restores the original. The [default policies](./app#default-policies) use it for decrypt caching and signer logging.

## `Session`

A `Session` is a serializable login descriptor. It holds only data, never a live signer, so it can be stored anywhere and rehydrated later.

```typescript
type Session<M extends string = string, D = unknown> = {method: M; data: D}
```

### Building sessions

`toSession` builds a typed session from a handler:

```typescript
toSession<M, D>(handler: SessionHandler<M, D>, data: D): Session<M, D>
```

```typescript
import {toSession, nip01, nip07, nip46} from "@welshman/app"

const a = toSession(nip01, {secret: "<hex secret>"})
const b = toSession(nip07, {})
const c = toSession(nip46, {clientSecret, signerPubkey, relays})
```

## Session handlers

A `SessionHandler` maps a session's `data` back to an `ISigner`:

```typescript
type SessionHandler<M extends string, D> = {
  method: M
  getSigner: (data: D) => MaybeAsync<ISigner>
}
```

### Built-in handlers

These are registered automatically when the package loads:

| Handler | `method` | `data` shape | Signer |
|---|---|---|---|
| `nip01` | `"nip01"` | `{secret: string}` | `Nip01Signer` |
| `nip07` | `"nip07"` | `{}` | `Nip07Signer` (browser extension) |
| `nip46` | `"nip46"` | `{clientSecret, signerPubkey, relays}` | `Nip46Signer` (remote signer / bunker) |
| `nip55` | `"nip55"` | `{pubkey, signer}` | `Nip55Signer` (Android signer app) |
| `pomade` | `"pomade"` | `{clientOptions, email}` | `PomadeSigner` |

`pomade` imports `@pomade/core` the first time a pomade session builds a signer, so apps that never use it don't carry it in their main bundle.

`nip55` needs the Capacitor plugin handed to `@welshman/signer` once at startup. Until then, building a signer from a `nip55` session throws `"Nip55 is not enabled"`:

```typescript
import {NostrSignerPlugin} from "nostr-signer-capacitor-plugin"
import {setNip55Plugin} from "@welshman/signer"

setNip55Plugin(NostrSignerPlugin)
```

### Registering custom handlers

`defineSessionHandler` infers `M` and `D`, so `getSigner` is type-checked against the data shape:

```typescript
import {defineSessionHandler, registerSessionHandler, unregisterSessionHandler} from "@welshman/app"

const myHandler = defineSessionHandler({
  method: "my-method",
  getSigner: (data: {token: string}) => new MyCustomSigner(data.token),
})

registerSessionHandler(myHandler)
// later: unregisterSessionHandler(myHandler)
```

### Resolving signers directly

```typescript
getSignerFromSession(session: Session): MaybeAsync<ISigner> | undefined
```

Returns the signer for a session, or `undefined` if no handler is registered for its method. `User.fromSession` wraps it.

## A complete login flow

```typescript
import {createApp, User, toSession, nip07} from "@welshman/app"

// On login: build a serializable session and persist it
const session = toSession(nip07, {})
localStorage.setItem("session", JSON.stringify(session))

// On startup: rehydrate the user and create the app
const stored = JSON.parse(localStorage.getItem("session")!)
const user = await User.fromSession(stored)        // User | undefined
const app = createApp({user})
```
