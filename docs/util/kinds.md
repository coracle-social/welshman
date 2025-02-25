# Event Kinds

This module provides a comprehensive collection of Nostr event kind definitions and utilities.
It includes standard NIP event kinds as well as commonly used application-specific kinds.


## Kind Type Checkers

```typescript
// Check if kind is ephemeral (should not be stored)
export const isEphemeralKind = (kind: number): boolean

// Check if kind is replaceable (only latest event matters)
export const isReplaceableKind = (kind: number): boolean

// Check if kind is plain replaceable (no parameters)
export const isPlainReplaceableKind = (kind: number): boolean

// Check if kind is parameterized replaceable
export const isParameterizedReplaceableKind = (kind: number): boolean
```

## Usage Examples

### Checking Event Types
```typescript
import { isReplaceableKind, PROFILE, NOTE } from '@welshman/util'

// Profile events are replaceable
isReplaceableKind(PROFILE) // => true

// Notes are not replaceable
isReplaceableKind(NOTE) // => false
```

### Working with DVMs
```typescript
import {
  DVM_REQUEST_TEXT_SUMMARY,
  DVM_RESPONSE_TEXT_SUMMARY,
  isDVMKind
} from '@welshman/util'

// Create DVM request
const request = {
  kind: DVM_REQUEST_TEXT_SUMMARY,
  content: "Text to summarize"
}

// Check for DVM events
isDVMKind(event.kind) // => true for kinds 5000-7000
```

### Handling Replaceable Events
```typescript
import {
  isReplaceableKind,
  PROFILE,
  LONG_FORM
} from '@welshman/util'

function handleEvent(event) {
  if (isReplaceableKind(event.kind)) {
    // Only keep latest version
    replaceExistingEvent(event)
  } else {
    // Keep all versions
    storeNewEvent(event)
  }
}
```
