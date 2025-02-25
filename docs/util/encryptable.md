# Encryptable

The Encryptable module provides a system for handling encrypted Nostr events, particularly useful for private content like muted lists, bookmarks, or other encrypted user data.

## Core Types

### Encrypt Function
```typescript
type Encrypt = (x: string) => Promise<string>
```

### Encryptable Updates
```typescript
type EncryptableUpdates = {
  content?: string
  tags?: string[][]
}
```

### Decrypted Event
```typescript
type DecryptedEvent = TrustedEvent & {
  plaintext: EncryptableUpdates
}
```

## Encryptable Class

```typescript
class Encryptable<T extends EventTemplate> {
  constructor(
    readonly event: Partial<T>,      // Base event template
    readonly updates: EncryptableUpdates // Plaintext updates
  )
}
```

## Usage

### Basic Encryption
```typescript
// Create encryptable event
const encryptable = new Encryptable(
  { kind: 10000 }, // Base event
  { content: "secret content" } // Plaintext updates
)

// Encrypt and get final event
const event = await encryptable.reconcile(encryptFn)
```

### Private Lists
```typescript
// Create private mute list
const muteList = new Encryptable(
  {
    kind: 10000, // Mute list kind
    tags: []     // Public tags
  },
  {
    content: JSON.stringify(['pubkey1', 'pubkey2']), // Private content
    tags: [['p', 'pubkey1'], ['p', 'pubkey2']]      // Private tags
  }
)

// Encrypt for publishing
const encrypted = await muteList.reconcile(async (content) => {
  return await nip04.encrypt(pubkey, content)
})
```

### Updating Encrypted Content
```typescript
// Create encryptable from existing event
const existing = {
  kind: 10000,
  content: encryptedContent,
  tags: publicTags
}

// Add new encrypted content
const updated = new Encryptable(
  existing,
  {
    content: JSON.stringify(newContent),
    tags: newPrivateTags
  }
)

const final = await updated.reconcile(encrypt)
```

## Helper Functions

### Create Decrypted Event
```typescript
import { asDecryptedEvent } from '@welshman/util'

// Add plaintext content to event
const decrypted = asDecryptedEvent(
  event,
  {
    content: decryptedContent,
    tags: decryptedTags
  }
)
```

## Examples

### Private Bookmarks
```typescript
// Create private bookmark list
const bookmarks = new Encryptable(
  {
    kind: 10003,
    tags: [['d', 'bookmarks']] // Public identifier
  },
  {
    content: JSON.stringify([
      { id: 'note1', title: 'Secret Note' }
    ])
  }
)

// Encrypt for publishing
const event = await bookmarks.reconcile(async (content) => {
  return await myEncryptionFunction(content)
})
```

### Encrypted Group Membership
```typescript
// Create private group member list
const members = new Encryptable(
  {
    kind: 30000,
    tags: [['d', 'group-members']]
  },
  {
    tags: members.map(m => ['p', m.pubkey, m.role])
  }
)

const encrypted = await members.reconcile(encrypt)
```

### Updating Private Content
```typescript
function updatePrivateList(event: DecryptedEvent, newItems: string[]) {
  return new Encryptable(
    event,
    {
      content: JSON.stringify(newItems)
    }
  )
}

// Usage
const updated = updatePrivateList(existingEvent, newItems)
const final = await updated.reconcile(encrypt)
```
