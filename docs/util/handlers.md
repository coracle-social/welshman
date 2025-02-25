# Handlers (NIP-89)

The Handlers module provides functionality for working with handler recommendations and information (NIP-89).
Handlers are events that describe which kinds a given application can display.

This module provides utilities for transforming these events into structured handler objects that applications can easily process.


## Types

### Handler Definition

```typescript
type Handler = {
  kind: number          // Event kind this handler can process
  name: string          // Display name of the handler
  about: string         // Description
  image: string         // Icon or image URL
  identifier: string    // Unique identifier (d-tag)
  event: TrustedEvent   // Original handler event
  website?: string      // Optional website URL
  lud16?: string        // Optional Lightning address
  nip05?: string        // Optional NIP-05 identifier
}
```

## Core Functions

### Reading Handlers
```typescript
function readHandlers(event: TrustedEvent): Handler[]

// Example
const handlers = readHandlers(handlerEvent)
handlers.forEach(handler => {
  console.log(`Handler for kind ${handler.kind}: ${handler.name}`)
})
```

### Handler Identification
```typescript
function getHandlerKey(handler: Handler): string
// Returns "kind:address" format

function getHandlerAddress(event: TrustedEvent): string | undefined
// Gets handler address from event tags
```

### Display Formatting
```typescript
function displayHandler(
  handler?: Handler,
  fallback = ""
): string
```

## Usage Examples

### Reading Handler Information
```typescript
const event = {
  kind: 31990, // Handler Information kind
  content: JSON.stringify({
    name: "Note Viewer",
    about: "Displays text notes with formatting",
    image: "https://example.com/icon.png"
  }),
  tags: [
    ['k', '1'], // Handles kind 1 (text notes)
    ['d', 'note-viewer']
  ]
}

const handlers = readHandlers(event)
// Returns array of handlers defined in the event
```

### Working with Handlers
```typescript
// Get unique handler identifier
const key = getHandlerKey(handler)
// => "1:30023:note-viewer" (kind:pubkey:identifier)

// Display handler name
const name = displayHandler(handler, "Unknown Handler")
// => "Note Viewer" or fallback if handler undefined

// Get handler address
const address = getHandlerAddress(event)
// Returns address from tags with 'web' marker or first address
```

## Complete Example

```typescript
// Process handler information event
function processHandlerEvent(event: TrustedEvent) {
  // Read all handlers from event
  const handlers = readHandlers(event)

  // Process each handler
  handlers.forEach(handler => {
    // Generate unique key
    const key = getHandlerKey(handler)

    // Store handler information
    handlerRegistry.set(key, {
      name: handler.name,
      kind: handler.kind,
      about: handler.about,
      image: handler.image,
      website: handler.website,
      address: getHandlerAddress(handler.event)
    })
  })
}

// Find handler for event kind
function findHandler(kind: number): Handler | undefined {
  return Array.from(handlerRegistry.values())
    .find(h => h.kind === kind)
}

// Display handler information
function renderHandler(handler: Handler) {
  return {
    title: displayHandler(handler, "Unknown"),
    description: handler.about,
    icon: handler.image,
    website: handler.website || null
  }
}
```
