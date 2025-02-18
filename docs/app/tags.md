# Tag Utilities

The tag utilities provide helper functions for creating properly formatted Nostr event tags with correct relay hints and metadata.
These are especially useful when creating events that reference other events or users.

## Tag Creators


### User Tags
```typescript
import {tagPubkey} from '@welshman/app'

// Create a p-tag with relay hint and profile name
const tag = tagPubkey(authorPubkey)
// => ["p", pubkey, "wss://relay.example.com", "username"]
```


### Event Reference Tags

```typescript
import {
  tagEvent,              // Basic event reference
  tagEventForQuote,      // For quoting events
  tagEventForReply,      // For reply threads
  tagEventForComment,    // For NIP-23 comments
  tagEventForReaction    // For reactions
} from '@welshman/app'

// Real world example: Creating a reply
const createReply = async (parent: TrustedEvent, content: string) => {
  // Get proper tags for a reply, including:
  // - All referenced pubkeys
  // - Root/reply markers
  // - Inherited mentions
  // - Relay hints
  const tags = tagEventForReply(parent)

  const event = await signer.get().sign(
    createEvent(NOTE, {
      content,
      tags,
      created_at: now()
    })
  )

  return publishThunk({
    event,
    // Use relay hints from tags
    relays: ctx.app.router.PublishEvent(event).getUrls()
  })
}
```

All tag creators:
- Add appropriate relay hints using the router
- Handle replaceable/parameterized events
- Follow NIP-10 conventions for threading
- Include metadata like usernames
- Deduplicate references
- Preserve tag order

The tagging system is crucial for:
- Thread construction
- Event reactions
- User mentions
- Zap splits
- Relay hints

Tag utilities ensure consistent and correct tag creation across the application while integrating with the router for relay hints.
