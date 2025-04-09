# Router

The Welshman router can be used to enable the `outbox model` in your Nostr application. It handles relay selection for reading, writing, and discovering events while considering relay quality, user preferences, and network conditions.

## Overview

The router provides scenarios for common **Nostr** operations:

- Reading user profiles
- Publishing events
- Following threads
- Handling DMs
- Searching content

Each scenario considers:

- User's relay preferences (NIP-65)
- Event hints in tags
- Relay quality scores
- Fallback policies
- Connection status

## Basic Usage

```typescript
import {routerContext, addMaximalFallbacks, Router} from '@welshman/app'

// Set up global router options
routerContext.getDefaultRelays = () => ["wss://relay.damus.io/", "wss://nos.lol/"]

// Router can be used directly with options, or via a singleton with global options
const router = Router.get()

// Get relays for reading a profile
const readRelays = router.ForPubkey(pubkey).getUrls()

// Get relays for broadcasting events by the current user
const writeRelays = router.FromUser().getUrls()

// Get relays for a quote
const quoteRelays = Router.get()
  .Quote(parentEvent, idOrAddress, relayHints)
  .policy(addMaximalFallbacks)
  .getUrls()

```

## Router Features

- Smart relay selection based on relay monitoring
- Quality scoring of relays
- Fallback strategies
- Handling of special relay types (.onion, local)
- NIP-65 support

The router is central to efficient nostr operations, ensuring events reach their intended audience while minimizing unnecessary network traffic.
