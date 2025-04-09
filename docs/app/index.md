# @welshman/app

[![version](https://badgen.net/npm/v/@welshman/app)](https://npmjs.com/package/@welshman/app)

A comprehensive framework for building nostr clients, powering production applications like [Coracle](https://coracle.social) and [Flotilla](https://flotilla.social). It provides a complete toolkit for managing events, subscriptions, user data, and relay connections.

## What's Included

- **Repository System** - Event storage and query capabilities
- **Router** - Intelligent relay selection for optimal networking
- **Feed Controller** - Manages feed creation and updates
- **Session Management** - User identity and key management
- **Event Actions** - High-level operations like reacting, replying, etc.
- **Profile Management** - User profile handling and metadata
- **Relay Directories** - Discovery and management of relays
- **Web of Trust** - Utilities for building webs of trust

## Quick Example

```typescript
import {getNip07} from '@welshman/signer'
import {load, request, RequestEvent, defaultSocketPolicies, makeSocketPolicyAuth, Socket} from '@welshman/net'
import {StampedEvent, TrustedEvent, makeEvent, NOTE} from '@welshman/util'
import {pubkey, signer, publishThunk} from '@welshman/app'

// Log in via NIP 07
addSession({method: 'nip07', pubkey: await getNip07().getPubkey()})

// Enable automatic authentication to relays
defaultSocketPolicies.push(
  makeSocketPolicyAuth({
    sign: (event: StampedEvent) => signer.get()?.sign(event),
    shouldAuth: (socket: Socket) => true,
  }),
)

// This will fetch the user's profile automatically, and return a store that updates
// automatically. Several different stores exist that are ready to go, including handles,
// zappers, relaySelections, relays, follows, mutes.
const profile = deriveProfile(pubkey.get())

// Publish is done using thunks, which optimistically publish to the local database, deferring
// signing and publishing for instant user feedback. Progress is reported as relays accept/reject the event
// Events are automatically signed using the current session
const thunk = publishThunk({
  relays: Router.get().FromUser().getUrls(),
  event: makeEvent(NOTE, {content: "hi"}),
  delay: 3000,
})

// Thunks can be aborted until after `delay`, allowing for soft-undo
thunk.controller.abort()

// Some commands are included
const thunk = follow('97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322')

// Load events as a promise
const events = await load({
  relays: Router.get().ForUser().getUrls(),
  filters: [{kinds: [NOTE],
}])

// Or use `request` for more fine-grained subscription control
const req = request({
  relays: Router.get().ForUser().getUrls(),
  filters: [{kinds: [NOTE],
}])

// Listen for events
req.on(RequestEvent.Event, (event: TrustedEvent) => {
  console.log(event)
})

// Close the req
req.close()
```

## Installation

```bash
npm install @welshman/app
```
