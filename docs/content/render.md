# Content Renderer

The renderer system in `@welshman/content` provides utilities for converting parsed content into text or HTML output. It includes customizable rendering options and specialized handlers for each content type.

## Render Options

```typescript
type RenderOptions = {
  // String to use for newlines
  newline: string

  // Base URL for Nostr entities
  entityBase: string

  // Custom link rendering
  renderLink: (href: string, display: string) => string

  // Custom entity rendering
  renderEntity: (entity: string) => string

  // Custom function for creating an element
  createElement: (tag: string) => any
}
```

## Built-in Renderers

- `makeTextRenderer` - renders an array of `Parsed` elements as text
- `makeHtmlRenderer` - renders an array of `Parsed` elements as HTML

## Main Functions

- `render(parsed, renderer)` - Renders single or multiple parsed elements
- `renderAsText(parsed, options)` - Convenience function for text rendering
- `renderAsHtml(parsed, options)` - Convenience function for HTML rendering

## Example Usage

```typescript
import { parse, renderAsHtml } from '@welshman/content'

const content = `Check out this cool #nostr client!
Visit npub1jlrs53pkdfjnts29kveljul2sm0actt6n8dxrrzqcersttvcuv3qdjynqn for more info
https://github.com/coracle-social/welshman`

// Parse the content
const parsed = parse({ content })

// Render as HTML with custom options
const html = renderAsHtml(parsed, {
  entityBase: 'https://njump.me/',
  renderEntity: (entity) => entity.slice(0, 12) + '...',
  renderLink: (href, display) => `<a href="${href}" class="custom-link">${display}</a>`
}).toString()

// Result:
// Check out this cool #nostr client!<br>
// Visit <a href="https://njump.me/nprofile1...">npub1jlrs53p...</a> for more info<br>
// <a href="https://github.com/coracle-social/welshman" class="custom-link">github.com/coracle-social/welshman</a>
```
