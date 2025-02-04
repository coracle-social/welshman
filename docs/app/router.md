# Router

The Router is the critical component to efficiently enable the `outbox model` in your Nostr application. It handles relay selection for reading, writing, and discovering events while considering relay quality, user preferences, and network conditions.

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
import {ctx, setContext} from '@welshman/lib'
import {getDefaultAppContext} from '@welshman/app'

// Initialize router
setContext({
  app: getDefaultAppContext()
})

// Use router scenarios
const router = ctx.app.router

// Get relays for reading a profile
const readRelays = router.ForPubkey(pubkey).getUrls()

// Get relays for publishing
const writeRelays = router.FromUser().getUrls()

// Get relays for a thread
const threadRelays = router.Replies(event).getUrls()
```

## Thread Navigation

```typescript
import {ctx} from '@welshman/lib'
import {createEvent, NOTE} from '@welshman/util'
import {publishThunk} from '@welshman/app'

const loadThread = async (event: TrustedEvent) => {
  // Get relays for root event
  const rootRelays = ctx.app.router
    .EventRoots(event)
    .getUrls()

  // Get relays for replies
  const replyRelays = ctx.app.router
    .EventParents(event)
    .getUrls()

  // Get relays for mentions
  const mentionRelays = ctx.app.router
    .EventMentions(event)
    .getUrls()

  // Load from all relevant relays
  await Promise.all([
    subscribe({filters, relays: rootRelays}),
    subscribe({filters, relays: replyRelays}),
    subscribe({filters, relays: mentionRelays})
  ])
}

// Posting a reply
const reply = async (parent: TrustedEvent, content: string) => {
  const event = createEvent(NOTE, {content})

  // Get optimal relays for publishing
  const relays = ctx.app.router
    .PublishEvent(event)
    // Skip .onion relays
    .allowOnion(false)
    // Allow up to 5 relays
    .limit(5)
    .getUrls()

  return publishThunk({event, relays})
}
```

## Router Features

- Smart relay selection based on context
- Quality scoring of relays
- Fallback strategies
- Handling of special relay types (.onion, local)
- Automatic weight calculation
- Connection state awareness
- NIP-65 compliance

The router is central to efficient nostr operations, ensuring events reach their intended audience while minimizing unnecessary network traffic.
