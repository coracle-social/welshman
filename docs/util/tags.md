# Tags

The Tags module provides comprehensive utilities for working with Nostr event tags, including helpers for extracting, validating, and manipulating different types of tags.

## Core Functions

### Basic Tag Operations
```typescript
// Get tags by type(s)
getTags(types: string | string[], tags: string[][]): string[][]

// Get single tag by type(s)
getTag(types: string | string[], tags: string[][]): string[] | undefined

// Get tag values
getTagValues(types: string | string[], tags: string[][]): string[]

// Get single tag value
getTagValue(types: string | string[], tags: string[][]): string | undefined
```

## Tag Type Extractors

### Event References
```typescript
// Get 'e' tags (event references)
getEventTags(tags: string[][]): string[][]
getEventTagValues(tags: string[][]): string[]

// Get 'a' tags (event addresses)
getAddressTags(tags: string[][]): string[][]
getAddressTagValues(tags: string[][]): string[]
```

### Profile References
```typescript
// Get 'p' tags (pubkey references)
getPubkeyTags(tags: string[][]): string[][]
getPubkeyTagValues(tags: string[][]): string[]
```

### Topics and Relays
```typescript
// Get 't' tags (topics/hashtags)
getTopicTags(tags: string[][]): string[][]
getTopicTagValues(tags: string[][]): string[]

// Get 'r' and 'relay' tags
getRelayTags(tags: string[][]): string[][]
getRelayTagValues(tags: string[][]): string[]
```

### Groups and Kinds
```typescript
// Get group tags
getGroupTags(tags: string[][]): string[][]
getGroupTagValues(tags: string[][]): string[]

// Get 'k' tags (kind references)
getKindTags(tags: string[][]): string[][]
getKindTagValues(tags: string[][]): number[]
```

## Thread Management

### Comment Tags
```typescript
// Get root and reply references
getCommentTags(tags: string[][]): {
  roots: string[][],
  replies: string[][]
}

getCommentTagValues(tags: string[][]): {
  roots: string[],
  replies: string[]
}
```

### Reply Tags
```typescript
// Get detailed reply structure
getReplyTags(tags: string[][]): {
  roots: string[][],     // Thread roots
  replies: string[][],   // Direct replies
  mentions: string[][]   // Mentions
}

getReplyTagValues(tags: string[][]): {
  roots: string[],
  replies: string[],
  mentions: string[]
}
```

## Utility Functions

```typescript
// Remove duplicate tags
uniqTags(tags: string[][]): string[][]

// Parse imeta tags into array of tag arrays
tagsFromIMeta(imeta: string[]): string[][]
```

## Usage Examples

### Basic Tag Handling
```typescript
// Get specific tag types
const pubkeys = getPubkeyTagValues(event.tags)
const topics = getTopicTagValues(event.tags)
const relays = getRelayTagValues(event.tags)

// Get multiple tag types
const refs = getTags(['p', 'e'], event.tags)

// Get single tag
const topic = getTagValue('t', event.tags)
```

### Thread Processing
```typescript
// Get thread context
const {roots, replies} = getReplyTags(event.tags)

// Process thread structure
function processThread(tags: string[][]) {
  const thread = getReplyTags(tags)

  return {
    rootEvents: thread.roots.map(t => t[1]),
    replyTo: thread.replies.map(t => t[1]),
    mentions: thread.mentions.map(t => t[1])
  }
}
```

### Tag Collection
```typescript
// Collect all references
function collectReferences(tags: string[][]) {
  return {
    events: getEventTagValues(tags),
    profiles: getPubkeyTagValues(tags),
    addresses: getAddressTagValues(tags)
  }
}
```
