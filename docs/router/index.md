# @welshman/router

[![version](https://badgen.net/npm/v/@welshman/router)](https://npmjs.com/package/@welshman/router)

Utilities for selecting nostr relays.

## What's Included

- **Router** - A configurable router class usable as a singleton which provides common relay selection scenarios.
- **RouterScenario** - A scenario class which scores relays based on policy.
- **getFilterSelections** - A high-level utility for inferring relay selections from fitlers.

## Quick Example

```typescript
import {routerContext, addMaximalFallbacks, Router} from '@welshman/router'

// Configure the global router instance based on RouterOptions
Router.configure({
  defaultRelays: ['wss://relay.example.com/'],
  getPubkeyRelays: (pubkey, mode) => ['wss://myrelay.example.com/'],
})

// Get the singleton and use it to select some relays
const router = Router.get()

// Get a hint based on pubkey
router.FromPubkeys(pubkeys).getUrl()

// Send an event to the author's outbox and mentions' inboxes
router.PublishEvent(event).getUrls()

// Try as hard as we can to find a quoted note
router
  .FromPubkeys(event, quotedEventId, hints)
  .allowLocal(true)
  .allowOnion(true)
  .allowInsecure(true)
  .policy(addMaximalFallbacks)
  .limit(10)
  .getUrls()
```

## Installation

```bash
npm install @welshman/router
```
