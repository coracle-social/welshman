# Nostr Events

The Events module provides type definitions and utilities for working with Nostr events, including creation, validation, and manipulation functions.

## API

### Event Types

```typescript
// Base event content structure
export type EventContent = {
  tags: string[][];
  content: string;
};

// Event template with kind
export type EventTemplate = EventContent & {
  kind: number;
};

// Event with timestamp
export type StampedEvent = EventTemplate & {
  created_at: number;
};

// Event with author
export type OwnedEvent = StampedEvent & {
  pubkey: string;
};

// Event with ID
export type HashedEvent = OwnedEvent & {
  id: string;
};

// Signed event
export type SignedEvent = HashedEvent & {
  sig: string;
};

// Event that may or may not be signed
export type TrustedEvent = HashedEvent & {
  sig?: string;
};
```

### Event Creation

```typescript
// Options for creating events
export type MakeEventOpts = {
  content?: string;
  tags?: string[][];
  created_at?: number;
};

// Creates a stamped event template
export declare const makeEvent: (kind: number, opts?: MakeEventOpts) => StampedEvent;
```

### Type Guards

```typescript
export declare const isEventTemplate: (e: EventTemplate) => e is EventTemplate;
export declare const isStampedEvent: (e: StampedEvent) => e is StampedEvent;
export declare const isOwnedEvent: (e: OwnedEvent) => e is OwnedEvent;
export declare const isHashedEvent: (e: HashedEvent) => e is HashedEvent;
export declare const isSignedEvent: (e: TrustedEvent) => e is SignedEvent;
```

### Event Utilities

```typescript
// Event validation and signatures
export declare const verifyEvent: (event: TrustedEvent) => boolean;

// Event properties
export declare const getIdentifier: (e: EventTemplate) => string | undefined;
export declare const getIdOrAddress: (e: HashedEvent) => string;
export declare const getIdAndAddress: (e: HashedEvent) => string[];

// Event deduplication by id or address
export declare const deduplicateEvents: (events: TrustedEvent[]) => TrustedEvent[];

// Event type checking
export declare const isEphemeral: (e: EventTemplate) => boolean;
export declare const isReplaceable: (e: EventTemplate) => boolean;
export declare const isPlainReplaceable: (e: EventTemplate) => boolean;
export declare const isParameterizedReplaceable: (e: EventTemplate) => boolean;

// Threading lives in @welshman/domain, alongside the kinds it applies to:
//   getReplyTagValues(tags)    from the Note kind    (NIP-10)
//   getCommentTagValues(tags)  from the Comment kind (NIP-22)
```

## Threading Protocols

`@welshman/domain` handles two different threading protocols:

### Regular Notes (NIP-10)
For regular notes and most event kinds, threading follows [NIP-10](https://github.com/nostr-protocol/nips/blob/master/10.md):
- Uses `e` and `a` tags with optional markers (`root`, `reply`, `mention`)
- Positional rules apply when markers are absent:
  - First `e`/`a` tag = root
  - Last `e`/`a` tag = reply target
  - Middle tags = mentions

### Comments (NIP-22)
For comments (kind 1111), threading follows [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md):
- Uses uppercase tags (`E`, `A`, `P`, `K`) for root references
- Uses lowercase tags (`e`, `a`, `p`, `k`) for reply references
- No positional rules - explicit tag types determine relationship

`getReplyTagValues` covers NIP-10 threading and `getCommentTagValues` covers NIP-22, each living with the kind it applies to.

## Examples

### Creating Events

```typescript
import { makeEvent, NOTE, LONG_FORM } from '@welshman/util';

// Create a basic note
const note = makeEvent(NOTE, {
  content: "Hello Nostr!",
  tags: [["t", "nostr"]]
});

// Create a long-form article with custom timestamp
const article = makeEvent(LONG_FORM, {
  content: "# My Article\n\nThis is my article content...",
  tags: [["d", "my-article"], ["title", "My Article"]],
  created_at: 1234567890
});
```

### Event Properties

```typescript
import { getIdentifier, getIdOrAddress, LONG_FORM } from '@welshman/util';

const article = makeEvent(LONG_FORM, {
  content: "Article content...",
  tags: [["d", "my-unique-id"]]
});

// Get the identifier (d tag value)
const identifier = getIdentifier(article); // "my-unique-id"

// For a hashed event, get ID or address
const reference = getIdOrAddress(hashedArticle);
// Returns address for replaceable events, ID for others
```

### Working with Threads

```typescript
import { NOTE, COMMENT } from '@welshman/util';
import { getCommentTagValues, getReplyTagValues } from '@welshman/domain';

// Regular note reply (NIP-10)
const noteReply = makeEvent(NOTE, {
  content: "This is a reply to a note",
  tags: [
    ["e", "root-event-id", "", "root"],
    ["e", "parent-event-id", "", "reply"]
  ]
});

// Comment reply (NIP-22)
const commentReply = makeEvent(COMMENT, {
  content: "This is a reply comment",
  tags: [
    ["E", "root-event-id"],  // uppercase = root reference
    ["e", "parent-event-id"] // lowercase = reply reference
  ]
});

// Both work the same way
const noteAncestors = getReplyTagValues(noteReply.tags);
const commentAncestors = getCommentTagValues(commentReply.tags);

console.log('Note roots:', noteAncestors.roots);     // ["root-event-id"]
console.log('Note replies:', noteAncestors.replies); // ["parent-event-id"]

console.log('Comment roots:', commentAncestors.roots);     // ["root-event-id"] 
console.log('Comment replies:', commentAncestors.replies); // ["parent-event-id"]

// Parent checking works for both protocols
if (getReplyTagValues(noteReply.tags).replies.includes(parentEvent.id)) {
  console.log('Note is a reply');
}
if (getReplyTagValues(commentReply.tags).replies.includes(parentEvent.id)) {
  console.log('Comment is a reply');
}
```
