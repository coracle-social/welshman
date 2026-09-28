# Content Parser

The parser turns nostr content into an array of typed elements.

## Core Types

### ParsedType Enum

- `Address` - naddr references to addressable events
- `Cashu` - Cashu token strings
- `Code` - Code blocks and inline code
- `Command` - NIP-CD command invocations at the start of the content
- `Ellipsis` - Truncation indicators
- `Email` - Email addresses
- `Emoji` - Custom emoji references
- `Event` - Event references (note/nevent)
- `Invoice` - Lightning invoices
- `Link` - HTTP/HTTPS URLs
- `LinkGrid` - Collections of adjacent links
- `Newline` - Line breaks
- `Profile` - Profile references (npub/nprofile)
- `Room` - NIP-29 room references written as `relay.example.com'roomid`
- `Text` - Plain text content
- `Topic` - Hashtags

## Main Functions

### parse(options)

```typescript
parse({content?: string, tags?: string[][]}) => Parsed[]
```

`parse` trims the content and falls back to the `alt` tag when it is empty. Tags supply custom emoji URLs, `imeta` metadata for links, and the targets of legacy `#[0]` mentions.

### truncate(content, options)

```typescript
truncate(content: Parsed[], {
  minLength?: number,     // 500 - minimum before truncating
  maxLength?: number,     // 700 - maximum total length
  mediaLength?: number,   // 200 - assumed size for media
  entityLength?: number   // 30 - assumed size for entities
}) => Parsed[]
```

Content shorter than `maxLength` is returned unchanged. Otherwise `truncate` cuts at `minLength`. Text and code elements are cut inside at the last line break or space, so a message that is one long code block is shortened like any other. Every other element is kept or dropped whole. Truncated content ends with an `Ellipsis` element.

### reduceLinks(content)

Combines links that each start a line into `LinkGrid` elements. Links inside a sentence stay `Link` elements.

```typescript
reduceLinks(content: Parsed[]) => Parsed[]
```

## Type Guards

Each `ParsedType` has a guard that narrows the element type: `isAddress(parsed)`, `isCashu(parsed)`, `isCode(parsed)`, `isEmail(parsed)`, and so on. `isImage(parsed)` matches links ending in `.jpg`, `.jpeg`, `.png`, `.gif` or `.webp`.

## Utilities

- `urlIsMedia(url)` - Checks whether a URL string ends in an image, audio or video extension

## Example Usage

```typescript
import { parse, truncate, reduceLinks } from '@welshman/content'

const content = `Check out this cool #nostr client!
https://github.com/coracle-social/welshman
https://welshman.coracle.social
Visit npub1jlrs53pkdfjnts29kveljul2sm0actt6n8dxrrzqcersttvcuv3qdjynqn for more info`

const parsed = parse({ content })
const withLinkGrids = reduceLinks(parsed)

// withLinkGrids:
// - Text: "Check out this cool "
// - Topic: "nostr"
// - Text: " client!"
// - Newline: "\n"
// - LinkGrid: [github.com/..., welshman.coracle.social]
// - Text: "Visit "
// - Profile: {pubkey, relays: []}
// - Text: " for more info"

// A link grid counts as mediaLength (200), so this ends after the grid with an Ellipsis
const truncated = truncate(withLinkGrids, {
  minLength: 100,
  maxLength: 200
})
```
