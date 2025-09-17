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

// Wrapped event (NIP-59)
export type UnwrappedEvent = HashedEvent & {
  wrap: SignedEvent;
};

// Event that can be either signed or wrapped
export type TrustedEvent = HashedEvent & {
  sig?: string;
  wrap?: SignedEvent;
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
export declare const isUnwrappedEvent: (e: TrustedEvent) => e is UnwrappedEvent;
export declare const isTrustedEvent: (e: TrustedEvent) => e is TrustedEvent;
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
export declare const deduplicateEvents: (e: TrustedEvent) => TrustedEvent[];

// Event type checking
export declare const isEphemeral: (e: EventTemplate) => boolean;
export declare const isReplaceable: (e: EventTemplate) => boolean;
export declare const isPlainReplaceable: (e: EventTemplate) => boolean;
export declare const isParameterizedReplaceable: (e: EventTemplate) => boolean;

// Thread and reply handling
// Note: getAncestors handles comments (kind 1111) differently from regular notes
export declare const getAncestors: (event: EventTemplate) => { roots: string[]; replies: string[] };
export declare const getParentIdsAndAddrs: (event: EventTemplate) => string[];
export declare const getParentIdOrAddr: (event: EventTemplate) => string | undefined;
export declare const getParentId: (event: EventTemplate) => string | undefined;
export declare const getParentAddr: (event: EventTemplate) => string | undefined;
export declare const isChildOf: (child: EventTemplate, parent: HashedEvent) => boolean;
```

## Threading Protocols

The `getAncestors` function handles two different threading protocols:

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

All `getParent*` functions and `isChildOf` include this logic, automatically handling both protocols based on event kind.

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
import { getAncestors, isChildOf, NOTE, COMMENT } from '@welshman/util';

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
const noteAncestors = getAncestors(noteReply);
const commentAncestors = getAncestors(commentReply);

console.log('Note roots:', noteAncestors.roots);     // ["root-event-id"]
console.log('Note replies:', noteAncestors.replies); // ["parent-event-id"]

console.log('Comment roots:', commentAncestors.roots);     // ["root-event-id"] 
console.log('Comment replies:', commentAncestors.replies); // ["parent-event-id"]

// Parent checking works for both protocols
if (isChildOf(noteReply, parentEvent)) {
  console.log('Note is a reply');
}
if (isChildOf(commentReply, parentEvent)) {
  console.log('Comment is a reply');
}
```
