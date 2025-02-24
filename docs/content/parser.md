# Content Parser

The content parser system in `@welshman/content` provides a powerful way to parse Nostr content into structured elements.
It handles various types of content including Nostr entities, links, code blocks, and special formats.

## Content Types

### Basic Types
```typescript
enum ParsedType {
  Text = "text",         // Plain text
  Newline = "newline",   // Line breaks
  Topic = "topic",       // Hashtags (#nostr)
  Code = "code",         // Code blocks (inline and multi-line)
  Link = "link",         // URLs
  LinkGrid = "link-grid" // Grid of media links
}
```

### Nostr-specific Types
```typescript
enum ParsedType {
  Event = "event",       // Nostr events (note1/nevent1)
  Profile = "profile",   // Profiles (npub1/nprofile1)
  Address = "address",   // Addresses (naddr1)
}
```

### Special Format Types
```typescript
enum ParsedType {
  Cashu = "cashu",       // Cashu tokens
  Invoice = "invoice",    // Lightning invoices
  Ellipsis = "ellipsis"  // Truncation marker
}
```

## Parsing Content

### Main Parser
```typescript
const parse = ({
  content = "",
  tags = []
}: {
  content?: string
  tags?: string[][]
}) => Parsed[]

// Example
const parsed = parse({
  content: "Hello #nostr, check nostr:npub1...",
  tags: [["p", "pubkey123"]]
})
```

### Available Parsers

The system includes specialized parsers for each content type:

```typescript
// Nostr Entities
parseAddress(text: string, context: ParseContext): ParsedAddress | void
parseEvent(text: string, context: ParseContext): ParsedEvent | void
parseProfile(text: string, context: ParseContext): ParsedProfile | void

// Code Blocks
parseCodeBlock(text: string, context: ParseContext): ParsedCode | void
parseCodeInline(text: string, context: ParseContext): ParsedCode | void

// Special Formats
parseCashu(text: string, context: ParseContext): ParsedCashu | void
parseInvoice(text: string, context: ParseContext): ParsedInvoice | void

// Basic Content
parseLink(text: string, context: ParseContext): ParsedLink | void
parseNewline(text: string, context: ParseContext): ParsedNewline | void
parseTopic(text: string, context: ParseContext): ParsedTopic | void
```

## Content Processing

### Truncation
```typescript
type TruncateOpts = {
  minLength?: number    // Minimum content length (default: 500)
  maxLength?: number    // Maximum content length (default: 700)
  mediaLength?: number  // Length value for media items (default: 200)
  entityLength?: number // Length value for entities (default: 30)
}

const truncate = (
  content: Parsed[],
  options?: TruncateOpts
) => Parsed[]

// Example
const truncated = truncate(parsed, {
  maxLength: 1000,
  mediaLength: 150
})
```

### Link Processing
```typescript
// Consolidate consecutive image links into grids
const reduceLinks = (content: Parsed[]) => Parsed[]

// Example
const processed = reduceLinks(parsed)
```

## Type Guards

```typescript
// Basic content
isText(parsed: Parsed): parsed is ParsedText
isNewline(parsed: Parsed): parsed is ParsedNewline
isCode(parsed: Parsed): parsed is ParsedCode
isTopic(parsed: Parsed): parsed is ParsedTopic

// Links and media
isLink(parsed: Parsed): parsed is ParsedLink
isImage(parsed: Parsed): parsed is ParsedLink
isLinkGrid(parsed: Parsed): parsed is ParsedLinkGrid

// Nostr entities
isEvent(parsed: Parsed): parsed is ParsedEvent
isProfile(parsed: Parsed): parsed is ParsedProfile
isAddress(parsed: Parsed): parsed is ParsedAddress

// Special formats
isCashu(parsed: Parsed): parsed is ParsedCashu
isInvoice(parsed: Parsed): parsed is ParsedInvoice
isEllipsis(parsed: Parsed): parsed is ParsedEllipsis
```

## Complete Example

```typescript
// Parse content with tags
const parsed = parse({
  content: `
    Hello #nostr!

    Check out this note: nostr:note1...
    And this profile: nostr:npub1...

    Some code: \`console.log("hello")\`

    https://example.com/image.jpg
    https://example.com/image2.jpg
  `,
  tags: [
    ["p", "pubkey123"],
    ["e", "event456"]
  ]
})

// Process the content
const processed = reduceLinks(parsed)

// Truncate if needed
const final = truncate(processed, {
  maxLength: 500,
  mediaLength: 150
})

// Check types and handle accordingly
final.forEach(item => {
  if (isImage(item)) {
    // Handle image
  } else if (isProfile(item)) {
    // Handle profile reference
  } else if (isCode(item)) {
    // Handle code block
  }
})
```

This parser system provides a robust foundation for handling Nostr content, with support for various content types and processing needs. The type-safe approach ensures reliable content handling while maintaining flexibility for different use cases.
