# Content Renderer

The renderer system in `@welshman/content` provides flexible ways to convert parsed content into text or HTML output. It includes customizable rendering options and specialized handlers for each content type.

## Renderer Class

```typescript
class Renderer {
  constructor(readonly options: RenderOptions)

  // Core methods
  toString(): string
  addText(value: string): void
  addNewlines(count: number): void
  addLink(href: string, display: string): void
  addEntityLink(entity: string): void
}
```

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
}
```

## Built-in Renderers

### Text Renderer
```typescript
const textRenderOptions = {
  newline: "\n",
  entityBase: "",
  renderLink: (href, display) => href,
  renderEntity: (entity) => entity.slice(0, 16) + "…"
}

const textRenderer = makeTextRenderer({
  // Override default options if needed
})
```

### HTML Renderer
```typescript
const htmlRenderOptions = {
  newline: "\n",
  entityBase: "https://njump.me/",
  renderLink: (href, display) => {
    const element = document.createElement("a")
    element.href = sanitizeUrl(href)
    element.target = "_blank"
    element.innerText = display
    return element.outerHTML
  },
  renderEntity: (entity) => entity.slice(0, 16) + "…"
}

const htmlRenderer = makeHtmlRenderer({
  // Override default options if needed
})
```

## Content Type Renderers

```typescript
// Basic content
renderText(p: ParsedText, r: Renderer): void
renderNewline(p: ParsedNewline, r: Renderer): void
renderCode(p: ParsedCode, r: Renderer): void
renderTopic(p: ParsedTopic, r: Renderer): void

// Links
renderLink(p: ParsedLink, r: Renderer): void

// Nostr entities
renderEvent(p: ParsedEvent, r: Renderer): void
renderProfile(p: ParsedProfile, r: Renderer): void
renderAddress(p: ParsedAddress, r: Renderer): void

// Special formats
renderCashu(p: ParsedCashu, r: Renderer): void
renderInvoice(p: ParsedInvoice, r: Renderer): void
renderEllipsis(p: ParsedEllipsis, r: Renderer): void
```

## Usage Examples

### Basic Text Rendering
```typescript
const parsed = parse({
  content: "Hello #nostr, check nostr:npub1...",
  tags: []
})

// Render as plain text
const text = renderAsText(parsed).toString()

// Render as HTML
const html = renderAsHtml(parsed).toString()
```

### Custom Rendering Options
```typescript
// Custom text renderer
const customText = renderAsText(parsed, {
  entityBase: "nostr:",
  renderEntity: (entity) => entity.slice(0, 8)
}).toString()

// Custom HTML renderer
const customHtml = renderAsHtml(parsed, {
  entityBase: "https://example.com/",
  renderLink: (href, display) => `<a class="custom-link" href="${href}">${display}</a>`,
  renderEntity: (entity) => `<span class="entity">${entity}</span>`
}).toString()
```

### Rendering Individual Elements
```typescript
const renderer = makeHtmlRenderer()

// Render single element
renderOne({
  type: ParsedType.Link,
  value: {
    url: new URL("https://example.com"),
    meta: {},
    isMedia: false
  },
  raw: "https://example.com"
}, renderer)

// Render multiple elements
renderMany([
  {
    type: ParsedType.Text,
    value: "Hello ",
    raw: "Hello "
  },
  {
    type: ParsedType.Topic,
    value: "nostr",
    raw: "#nostr"
  }
], renderer)
```

### Complete Example
```typescript
// Parse and process content
const parsed = parse({
  content: `
    Check out this profile: nostr:npub1...

    Code example:
    \`console.log("hello")\`

    #nostr #bitcoin

    https://example.com/image.jpg
  `,
  tags: []
})

// Create custom renderer
const renderer = makeHtmlRenderer({
  entityBase: "https://example.com/",
  renderLink: (href, display) => {
    if (href.endsWith('.jpg')) {
      return `<img src="${href}" alt="${display}">`
    }
    return `<a href="${href}">${display}</a>`
  },
  renderEntity: (entity) => {
    return `<span class="entity">${entity.slice(0, 8)}</span>`
  }
})

// Render content
const html = render(parsed, renderer).toString()
```


The renderer system provides a flexible way to output parsed content in various formats while maintaining control over the rendering process. Its modular design allows for easy customization and extension for specific application needs.
