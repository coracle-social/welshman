# @welshman/content

[![version](https://badgen.net/npm/v/@welshman/content)](https://npmjs.com/package/@welshman/content)

`@welshman/content` is a comprehensive content processing library designed specifically for Nostr applications.
It provides a robust system for parsing, processing, and rendering Nostr content while handling various special formats and entities common in the Nostr ecosystem.


## Core Concepts

The package is built around two main components:

1. **Parser**: Transforms raw content into structured elements
   ```typescript
   const parsed = parse({
     content: "Hello #nostr, check nostr:npub1...",
     tags: [["p", "pubkey123"]]
   })
   ```

2. **Renderer**: Converts parsed content into desired output format
   ```typescript
   const html = renderAsHtml(parsed).toString()
   const text = renderAsText(parsed).toString()
   ```

## Common Use Cases

- Rendering Nostr notes with proper entity linking
- Processing and displaying user content safely
- Handling rich text content in Nostr clients
- Converting between different content formats
- Creating customized content displays

## Quick Example

```typescript
import { parse, renderAsHtml, truncate } from '@welshman/content'

// Parse and process content
const parsed = parse({
  content: `
    Hello #nostr!
    Check out this note: nostr:note1...
    https://example.com/image.jpg
  `,
  tags: [["p", "pubkey123"]]
})

// Truncate if needed
const truncated = truncate(parsed, {
  maxLength: 500,
  mediaLength: 150
})

// Render as HTML
const html = renderAsHtml(truncated, {
  entityBase: "https://your-app.com/"
}).toString()
```

## Installation

```bash
npm install @welshman/content
```

This package is essential for applications that need to handle Nostr content in a structured and safe way, providing all the necessary tools for parsing, processing, and rendering Nostr-specific content formats.
