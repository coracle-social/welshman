# Content Parser

The content parser system in `@welshman/content` provides utilities for parsing Nostr content into structured elements.

## Core Types

### ParsedType Enum

Defines all supported content types:
- `Address` - naddr references to parameterized replaceable events
- `Cashu` - Cashu token strings
- `Code` - Code blocks and inline code
- `Ellipsis` - Truncation indicators
- `Emoji` - Custom emoji references
- `Event` - Event references (note/nevent)
- `Invoice` - Lightning invoices
- `Link` - HTTP/HTTPS URLs
- `LinkGrid` - Collections of adjacent links
- `Newline` - Line breaks
- `Profile` - Profile references (npub/nprofile)
- `Text` - Plain text content
- `Topic` - Hashtags

## Main Functions

### parse(options)

Main parsing function that processes content into structured elements:

```typescript
parse({content?: string, tags?: string[][]}) => Parsed[]
```

Takes content string and optional tags array, returns array of parsed elements. Uses tags for emoji lookup and imeta information.

### truncate(content, options)

Truncates parsed content to specified length limits:

```typescript
truncate(content: Parsed[], {
  minLength?: number,     // 500 - minimum before truncating
  maxLength?: number,     // 700 - maximum total length
  mediaLength?: number,   // 200 - assumed size for media
  entityLength?: number   // 30 - assumed size for entities
}) => Parsed[]
```

### reduceLinks(content)

Combines adjacent links into `LinkGrid` elements for better presentation:

```typescript
reduceLinks(content: Parsed[]) => Parsed[]
```

## Type Guards

Utility functions to check parsed element types:
- `isAddress(parsed)`, `isCashu(parsed)`, `isCode(parsed)`, etc.
- `isImage(parsed)` - special check for image links

## Utilities

- `urlIsMedia(url)` - Checks if URL points to media file
- `fromNostrURI(s)` - Removes nostr: protocol prefix

## Example Usage

```typescript
import { parse, truncate, reduceLinks } from '@welshman/content'

const content = `Check out this cool #nostr client!
https://github.com/coracle-social/welshman
https://welshman.coracle.social
Visit npub1jlrs53pkdfjnts29kveljul2sm0actt6n8dxrrzqcersttvcuv3qdjynqn for more info`

// Parse the content into structured elements
const parsed = parse({ content })

// Combine adjacent links into grids
const withLinkGrids = reduceLinks(parsed)

// Truncate to reasonable length for preview
const truncated = truncate(withLinkGrids, {
  minLength: 100,
  maxLength: 200
})

// Result contains structured elements:
// - Text: "Check out this cool "
// - Topic: "nostr"
// - Text: " client!\n"
// - LinkGrid: [github.com/..., welshman.coracle.social]
// - Text: "Visit "
// - Profile: npub1jlrs53pkdfjnts29kveljul2sm0actt6n8dxrrzqcersttvcuv3qdjynqn
// - Text: " for more info"
```
