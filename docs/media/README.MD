# @welshman/store [![version](https://badgen.net/npm/v/@welshman/store)](https://npmjs.com/package/@welshman/store)

Utilities for dealing with svelte stores when using welshman.

```typescript
import {ctx, setContext} from '@welshman/lib'
import {getNip07} from '@welshman/signer'
import {throttled} from '@welshman/store'
import {createEvent, NOTE} from '@welshman/util'
import {
  getDefaultNetContext,
  getDefaultAppContext,
  signer,
  pubkey,
  publishThunk,
  load,
  initStorage,
  storageAdapters,
  freshness,
  plaintext,
  repository,
  tracker,
} from '@welshman/app'

// Set up app config
setContext({
  net: getDefaultNetContext(),
  app: getDefaultAppContext(),
})

// Log in via NIP 07
addSession({method: 'nip07', pubkey: await getNip07().getPubkey()})

// Signer is ready to go
const event = signer.get().encrypt(/* ... */)

// This will fetch the user's profile automatically, and return an observable that updates
// automatically. Several different stores exist that are ready to go, including handles,
// zappers, relaySelections, relays, follows, mutes.
const profile = deriveProfile(pubkey.get())

// A global router helps make intelligent relay selections
const router = ctx.app.router

// Publish is done using thunks, which optimistically publish to the local database, deferring
// signing and publishing for instant user feedback. Progress is reported as relays accept/reject the event
const thunk = publishThunk({
  relays: router.FromUser().getUrls(),
  event: createEvent(NOTE, {content: "hi"}),
  delay: 3000,
})

// Thunks can be aborted until after `delay`, allowing for soft-undo
thunk.controller.abort()

// Subscriptions automatically infer relays using `router` if not provided. If the request can be cached,
// results from the local repository are returned immediately. `subscribe` and `load` are both available
const events = await load({filters: [{kinds: [NOTE]}])

// Some commands are included
const thunk = follow('97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322')

// Stores can be easily synchronized with indexeddb. Freshness keeps track of how stale the caches are,
// plaintext maps encrypted events to their decrypted content, repository and tracker hold events and
// event/relay mappings, respectively.
const ready = initStorage("my-db", 1, {
  relays: {keyPath: "url", store: throttled(3000, relays)},
  handles: {keyPath: "nip05", store: throttled(3000, handles)},
  freshness: storageAdapters.fromObjectStore(freshness, {throttle: 3000}),
  plaintext: storageAdapters.fromObjectStore(plaintext, {throttle: 3000}),
  events: storageAdapters.fromRepositoryAndTracker(repository, tracker, {throttle: 3000}),
})
```
