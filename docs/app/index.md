# @welshman/app

[![version](https://badgen.net/npm/v/@welshman/app)](https://npmjs.com/package/@welshman/app)

An instance-based, composable client for building nostr applications. It powers production clients like [Coracle](https://coracle.social) and [Flotilla](https://flotilla.social), and ties together the rest of the welshman packages (`util`, `net`, `store`, `router`, `signer`, `feeds`) into a single, cohesive app layer.

## The core idea: an app is an `App` instance

Everything in `@welshman/app` hangs off a single `App` instance. An `App` owns the per-identity primitives — an event `Repository`, a connection `Pool`, a `Tracker`, and a `WrapManager` — plus a `config` and (optionally) a signed-in `User`. Because all state lives on the instance, two apps never share data: you can run multiple identities side-by-side, and tearing one down with `cleanup()` releases everything it allocated.

```typescript
import {createApp} from "@welshman/app"

// A batteries-included app (event ingestion, relay stats, gift-wrap
// unwrapping, and NIP-42 auth are all wired up by default policies)
const app = createApp()
```

Features are exposed as **plugins** — lazily-constructed singletons resolved through `app.use(...)`:

```typescript
import {createApp, Profiles, RelayLists, Thunks} from "@welshman/app"

const app = createApp()

// Each plugin is constructed once per app and memoized
const profiles = app.use(Profiles)
const relayLists = app.use(RelayLists)
```

This replaces the previous global-singleton design (`pubkey`, `deriveProfile`, `publishThunk`, `Router.get()`). There are no module-level globals anymore — you create an app and reach everything through it.

## Architecture at a glance

| Layer | What it is | Where |
|---|---|---|
| **`App`** | The app instance; owns repository/pool/tracker/wrapManager and the `use()` registry | [App](./app) |
| **`User` & sessions** | The signed-in identity and serializable login descriptors | [User & Sessions](./user) |
| **Policies** | Side effects installed at construction (ingest, auth, stats, wraps) | [App](./apppolicies) |
| **Plugins** | Lazily-resolved feature modules built on a small set of base classes | [Plugin architecture](./plugins) |
| **Data plugins** | Reactive collections of profiles, lists, relays, handles, zappers… | [Data](./data) |
| **Publishing** | Optimistic publishing via thunks | [Publishing](./publishing) |
| **Requests** | Loading & negentropy sync | [Requests](./requests) |
| **Routing** | Outbox-model relay selection and tag builders | [Routing](./routing) |
| **Web of Trust** | Follow/mute graph scoring | [Web of Trust](./wot) |
| **Feeds & Search** | Feed controllers and fuzzy search | [Feeds & Search](./feeds-and-search) |

## Quick example

```typescript
import {createApp, User, toSession, nip07, Profiles, Thunks, Router} from "@welshman/app"
import {getNip07} from "@welshman/signer"
import {makeEvent, NOTE} from "@welshman/util"
import {addMinimalFallbacks} from "@welshman/router"

// 1. Log in. A session is a serializable {method, data} descriptor; User
//    turns it back into a live, signing identity.
const pubkey = await getNip07().getPubkey()
const session = toSession(nip07, {})
const user = await User.fromSession(session)

// 2. Create the app around that user.
const app = createApp({user})

// 3. Read data reactively. Stores lazily fetch over the network using the
//    outbox model and update as events arrive.
const profile = app.use(Profiles).one(pubkey)   // Readable<Maybe<Profile>>
profile.subscribe($profile => console.log($profile?.name))

// 4. Publish optimistically. The event is written to the local repository
//    immediately, signed lazily, and progress is reported per-relay.
const thunk = app.use(Thunks).publishToOutbox({
  event: makeEvent(NOTE, {content: "hi"}),
  delay: 3000,                                   // soft-undo window
})

// Abort before `delay` elapses to undo
// thunk.abort()
await thunk.waitForCompletion()

// 5. Tear it all down
app.cleanup()
```

## Installation

```bash
npm install @welshman/app
# or
pnpm add @welshman/app
yarn add @welshman/app
```

`@welshman/app` has peer dependencies on `svelte` (4 or 5) and the other welshman workspace packages (`@welshman/feeds`, `@welshman/lib`, `@welshman/net`, `@welshman/router`, `@welshman/signer`, `@welshman/store`, `@welshman/util`), plus `@pomade/core` for the optional Pomade signer.
