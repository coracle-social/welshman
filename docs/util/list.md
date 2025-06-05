# Lists

The Lists module provides utilities for working with Nostr lists, including both public and private lists (like bookmarks, mute lists, etc.). It handles list creation, encryption, and manipulation.

## Core Types

### List Parameters
```typescript
interface ListParams {
  kind: number      // List kind (e.g., 10000 for mutes)
}
```

### List Structure
```typescript
interface List extends ListParams {
  publicTags: string[][]   // Publicly visible tags
  privateTags: string[][]  // Encrypted tags
  event?: DecryptedEvent   // Original event if list exists
}
```

### Published List
```typescript
interface PublishedList extends List {
  event: DecryptedEvent    // Required event for published lists
}
```

## List Creation

### Create New List
```typescript
function makeList(list: ListParams & Partial<List>): List

// Example
const muteList = makeList({
  kind: 10000,
  publicTags: [['d', 'mutes']],
  privateTags: [['p', 'pubkey1'], ['p', 'pubkey2']]
})
```

### Read Existing List
```typescript
function readList(event: DecryptedEvent): PublishedList

// Example
const list = readList(decryptedEvent)
```

## List Operations

### Get All Tags
```typescript
function getListTags(list: List | undefined): string[][]

// Example
const allTags = getListTags(list) // Combines public and private tags
```

### Remove Items
```typescript
// Remove by predicate
function removeFromListByPredicate(
  list: List,
  pred: (t: string[]) => boolean
): Encryptable

// Remove by value
function removeFromList(
  list: List,
  value: string
): Encryptable
```

### Add Items
```typescript
// Add public items
function addToListPublicly(
  list: List,
  ...tags: string[][]
): Encryptable

// Add private items
function addToListPrivately(
  list: List,
  ...tags: string[][]
): Encryptable
```

## Usage Examples

### Creating a Private List
```typescript
// Create new mute list
const muteList = makeList({
  kind: 10000,
  publicTags: [
    ['d', 'mutes'],
    ['name', 'My Mute List']
  ]
})

// Add items privately
const updated = addToListPrivately(
  muteList,
  ['p', 'pubkey1'],
  ['p', 'pubkey2']
)

// Add new items publicly
const addItems = addToListPublicly(
  list,
  ['p', 'pubkey3'],
  ['p', 'pubkey4']
)

// Encrypt and publish
const encrypted = await updated.reconcile(encrypt)
```

### Reading and Updating Lists
```typescript
// Read existing list
const list = readList(decryptedEvent)

// Remove item
const removeItem = removeFromList(list, 'pubkey1')

// Remove by predicate
const noMentions = removeFromListByPredicate(
  list,
  tag => tag[0] === 'p'
)
```

### Working with Tags
```typescript
// Get all list tags
const tags = getListTags(list)
```
