# Tag Utilities

The tag utilities provide helper functions for creating properly formatted Nostr event tags with correct relay hints and metadata.

These are especially useful when creating events that reference other events or users.

## Tag Creators

### Pubkey Tags

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
  tagEventForComment,    // For NIP-22 comments
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

  return publishThunk({
    // Use relay hints from tags
    relays: Router.get().PublishEvent(event).getUrls()
    event: await signer.get().sign(createEvent(NOTE, {content, tags})),
  })
}
```
