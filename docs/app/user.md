# User & Sessions

An `App` is centered on at most one identity, represented by a `User`. Login state that needs to be persisted is represented separately as a serializable `Session`. The two are connected by session handlers, which know how to turn a serialized session back into a live signer.

## `User`

A `User` is a single identity: a `pubkey` plus the `signer` that proves ownership of it.

```typescript
class User {
  constructor(readonly pubkey: string, readonly signer: ISigner)

  static fromSigner(signer: ISigner): Promise<User>
  static fromSession(session: Session): Promise<User | undefined>
  static require(app: IApp): User

  sign(event: StampedEvent): Promise<SignedEvent>
  nip44EncryptToSelf(payload: string): Promise<string>
}
```

### Constructing a user

- **`User.fromSigner(signer)`** — wraps `signer` in a [`LoggingSigner`](./applogging) (unless it already is one), derives the pubkey via `signer.getPubkey()`, and returns the `User`.
- **`User.fromSession(session)`** — resolves a signer from a serialized session (via the [handler registry](#session-handlers)) and returns the `User`, or `undefined` if no handler is registered for the session's method.

```typescript
import {User} from "@welshman/app"
import {getNip07} from "@welshman/signer"

const user = await User.fromSigner(getNip07())
```

### Gating user-only actions

`User.require(app)` returns `app.user`, throwing `"This action requires a signed-in user"` if there is none. Plugins use this internally before signing or encrypting; you can use it the same way.

```typescript
const user = User.require(app)
const signed = await user.sign(stampedEvent)
```

### Signing & self-encryption

- **`sign(event)`** delegates to the signer.
- **`nip44EncryptToSelf(payload)`** encrypts a payload to your own pubkey via NIP-44 — used for private list entries (mutes, follows) that only you should read.

## `Session`

A `Session` is a serializable login descriptor. It contains only data — never a live signer object — so it can be stored in `localStorage`, IndexedDB, or anywhere else, and rehydrated later.

```typescript
type Session<M extends string = string, D = unknown> = {method: M; data: D}
```

### Building sessions

Build a typed session from a handler with `toSession`:

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

### Registering custom handlers

Define a handler with `defineSessionHandler` (it infers `M`/`D` so `getSigner` is type-checked against the data shape), then register it:

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

Returns the signer for a session, or `undefined` if no handler is registered for its method. `User.fromSession` is a thin wrapper over this.

## A complete login flow

```typescript
import {createApp, User, toSession, nip07} from "@welshman/app"
import {getNip07} from "@welshman/signer"

// On login: build a serializable session and persist it
const session = toSession(nip07, {})
localStorage.setItem("session", JSON.stringify(session))

// On startup: rehydrate the user and create the app
const stored = JSON.parse(localStorage.getItem("session"))
const user = await User.fromSession(stored)        // User | undefined
const app = createApp({user})
```
