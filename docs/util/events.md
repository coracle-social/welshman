# Nostr Events

The Events module provides comprehensive type definitions and utilities for working with Nostr events, including helper functions for event creation, validation, and manipulation.

## Event Types Hierarchy

```typescript
// Base event with content and tags
interface EventContent {
  tags: string[][]
  content: string
}

// Base event with kind
interface EventTemplate extends EventContent {
  kind: number
}

// Event with timestamp
interface StampedEvent extends EventTemplate {
  created_at: number
}

// Event with author
interface OwnedEvent extends StampedEvent {
  pubkey: string
}

// Event with ID
interface HashedEvent extends OwnedEvent {
  id: string
}

// Event with signature
interface SignedEvent extends HashedEvent {
  sig: string
  [verifiedSymbol]?: boolean
}

// Event with wrapped content
interface UnwrappedEvent extends HashedEvent {
  wrap: SignedEvent
}

// Event that can be either signed or wrapped
type TrustedEvent = HashedEvent & {
  sig?: string
  wrap?: SignedEvent
  [verifiedSymbol]?: boolean
}
```

## Event Creation

### Create Basic Event
```typescript
import { createEvent } from '@welshman/util'

const event = createEvent(
  1, // kind
  {
    content: "Hello Nostr!",
    tags: [["t", "nostr"]],
    created_at: now() // Optional, defaults to current time
  }
)
```

## Type Guards

```typescript
// Check event types
isEventTemplate(event): boolean
isStampedEvent(event): boolean
isOwnedEvent(event): boolean
isHashedEvent(event): boolean
isSignedEvent(event): boolean
isUnwrappedEvent(event): boolean
isTrustedEvent(event): boolean
```

## Event Type Conversion

```typescript
// Convert to specific event types
asEventTemplate(event): EventTemplate
asStampedEvent(event): StampedEvent
asOwnedEvent(event): OwnedEvent
asHashedEvent(event): HashedEvent
asSignedEvent(event): SignedEvent
asUnwrappedEvent(event): UnwrappedEvent
asTrustedEvent(event): TrustedEvent
```

## Event Utilities

### Event Validation
```typescript
// Check if event has valid signature
hasValidSignature(event: SignedEvent): boolean

// Get event identifier (d tag)
getIdentifier(event: EventTemplate): string | undefined
```

### Event References
```typescript
// Get event ID or address
getIdOrAddress(event: HashedEvent): string

// Get both ID and address (if replaceable)
getIdAndAddress(event: HashedEvent): string[]
```

### Event Type Checking
```typescript
// Check event properties
isEphemeral(event: EventTemplate): boolean
isReplaceable(event: EventTemplate): boolean
isPlainReplaceable(event: EventTemplate): boolean
isParameterizedReplaceable(event: EventTemplate): boolean
```

### Thread & Reply Handling
```typescript
// Get thread information
getAncestors(event: EventTemplate): { roots: string[], replies: string[] }

// Get parent references
getParentIdsAndAddrs(event: EventTemplate): string[]
getParentIdOrAddr(event: EventTemplate): string | undefined
getParentId(event: EventTemplate): string | undefined
getParentAddr(event: EventTemplate): string | undefined

// Check reply relationship
isChildOf(child: EventTemplate, parent: HashedEvent): boolean
```

## Examples

### Creating and Processing Events

```typescript
// Create new event
const event = createEvent(1, {
  content: "Hello world!",
  tags: [["t", "greeting"]]
})

// Process based on type
if (isSignedEvent(event)) {
  // Handle signed event
  if (hasValidSignature(event)) {
    processValidEvent(event)
  }
} else if (isUnwrappedEvent(event)) {
  // Handle wrapped event
  processWrappedEvent(event)
}
```

### Working with Threads

```typescript
// Get thread context
const ancestors = getAncestors(event)
const rootId = ancestors.roots[0]
const replyTo = ancestors.replies[0]

// Check threading
if (isChildOf(event, parentEvent)) {
  // Handle reply
}
```

### Type Conversion

```typescript
// Convert to needed type
const template = asEventTemplate(event)
const stamped = asStampedEvent(event)
const owned = asOwnedEvent(event)
const hashed = asHashedEvent(event)
const signed = asSignedEvent(event)
```
