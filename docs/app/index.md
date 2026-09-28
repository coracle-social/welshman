# @welshman/app

[![version](https://badgen.net/npm/v/@welshman/app)](https://npmjs.com/package/@welshman/app)

An instance-based, composable client for building nostr applications. It powers [Coracle](https://coracle.social) and [Flotilla](https://flotilla.social), and ties the other welshman packages (`util`, `net`, `store`, `domain`, `signer`, `feeds`) together into one app layer.

## The `App` instance

Everything in `@welshman/app` hangs off an `App` instance. An `App` owns an event `Repository`, a connection `Pool`, a `Tracker`, and a `WrapManager`, plus a `config` and an optional signed-in `User`. Two apps never share data, so several identities can run side by side, and `cleanup()` releases everything an app allocated.

Features are **plugins**, constructed once per app and resolved through `app.use(...)`:

```typescript
import {createApp, Profiles, RelayLists} from "@welshman/app"

const app = createApp()

const profiles = app.use(Profiles)
const relayLists = app.use(RelayLists)
```

## Architecture at a glance

| Layer | What it is | Where |
|---|---|---|
| **`App`** | The app instance; owns repository/pool/tracker/wrapManager and the `use()` registry | [App](./app) |
| **`User` & sessions** | The signed-in identity and serializable login descriptors | [User & Sessions](./user) |
| **Policies** | Side effects installed at construction (ingest, auth, stats, wraps) | [App](./app#policies) |
| **Plugins** | Lazily-resolved feature modules built on a small set of base classes | [Plugin architecture](./plugins) |
| **Data plugins** | Reactive collections of profiles, lists, relays, handles, zappers… | [Data](./data) |
| **Publishing** | Optimistic publishing through a staged pipeline | [Publishing](./publishing) |
| **Requests** | Loading & negentropy sync | [Requests](./requests) |
| **Routing** | Outbox-model relay selection and tag builders | [Routing](./routing) |
| **Web of Trust** | Follow/mute graph scoring | [Web of Trust](./wot) |
| **Feeds & Search** | Feed controllers and fuzzy search | [Feeds & Search](./feeds-and-search) |

## Quick example

```typescript
import {createApp, User, toSession, nip07, Profiles, Publisher, Router} from "@welshman/app"
import {makeEvent, NOTE, userOutbox} from "@welshman/util"

// 1. Log in. A session is a serializable {method, data} descriptor; User
//    turns it back into a live, signing identity.
const session = toSession(nip07, {})
const user = (await User.fromSession(session))!

// 2. Create the app around that user.
const app = createApp({user})

// 3. Read data reactively. The store loads over the outbox model and
//    updates as events arrive.
const profile = app.use(Profiles).one(user.pubkey)   // Readable<Maybe<ProfileReader>>
profile.subscribe($profile => console.log($profile?.display()))

// 4. Publish optimistically. The event is written to the local repository
//    immediately, signed lazily, and progress is reported per relay.
const scenario = await app.use(Router).resolve([userOutbox()])
const publication = app.use(Publisher).publish({
  event: makeEvent(NOTE, {content: "hi"}),
  relays: scenario.getUrls(),
  delay: 3000,                                   // soft-undo window
})

// Abort before `delay` elapses to undo
// publication.abort()
await publication.settled()

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

`@welshman/app` has peer dependencies on `svelte` (4 or 5) and the other welshman workspace packages (`@welshman/domain`, `@welshman/feeds`, `@welshman/lib`, `@welshman/net`, `@welshman/signer`, `@welshman/store`, `@welshman/util`), plus `@pomade/core` for the optional Pomade signer.
