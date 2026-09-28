# Content Renderer

The renderer converts parsed content into text or HTML.

## Render Options

```typescript
type RenderOptions = {
  // String emitted for each newline character
  newline: string

  // Prefix for entity links
  entityBase: string

  escapeText: (value: string) => string
  renderLink: (href: string, display: string) => string

  // Display text for entity links
  renderEntity: (entity: string) => string

  createElement?: (tag: string) => any
}
```

The HTML defaults escape text, sanitize link URLs, open links in a new tab, and prefix entities with `https://njump.me/`. They build elements with `document.createElement`, so rendering HTML outside a browser needs a `createElement` override. The text defaults render links and entities as their full URL or bech32 string.

## Built-in Renderers

- `makeTextRenderer(options?)` - creates a `Renderer` configured for plain-text output
- `makeHtmlRenderer(options?)` - creates a `Renderer` configured for HTML output

## Main Functions

- `render(parsed, renderer)` - Renders one or many parsed elements into `renderer` and returns it
- `renderAsText(parsed, options?)` - Renders with a new text renderer
- `renderAsHtml(parsed, options?)` - Renders with a new HTML renderer

All three return the `Renderer`, and `toString()` gives the output. Topics render without their `#`, and rooms render as their raw text. `LinkGrid` elements are not rendered, so a UI that uses `reduceLinks` draws grids itself.

## Example Usage

```typescript
import { parse, renderAsHtml } from '@welshman/content'

const content = `Check out this cool #nostr client!
Visit npub1jlrs53pkdfjnts29kveljul2sm0actt6n8dxrrzqcersttvcuv3qdjynqn for more info
https://github.com/coracle-social/welshman`

const parsed = parse({ content })

const html = renderAsHtml(parsed, {
  entityBase: 'https://njump.me/',
  renderEntity: (entity) => entity.slice(0, 12) + '...',
  renderLink: (href, display) => `<a href="${href}" class="custom-link">${display}</a>`
}).toString()

// Check out this cool nostr client!
// Visit <a href="https://njump.me/nprofile1..." class="custom-link">nprofile1qqs...</a> for more info
// <a href="https://github.com/coracle-social/welshman" class="custom-link">github.com/coracle-social/welshman</a>
```

## Summaries

Text and HTML rendering both render an entity as the string it links to. A notification body, a speech synthesizer or a search result reads content as prose and needs each entity named instead.

`summarize(parsed, getName?)` replaces every element that is not prose with a `Text` element naming it. It returns `Parsed[]`, which goes through either renderer.

```typescript
import { parse, ParsedType, renderAsText, summarize } from '@welshman/content'

const parsed = parse({ content: "look at nostr:nevent1... https://example.com/cat.jpg" })

renderAsText(summarize(parsed)).toString()
// → 'look at another message an image'
```

`getName` receives the whole parsed element, including the pubkey needed to look up a display name. Returning `undefined` leaves the element to `defaultSummaryName`:

```typescript
renderAsText(
  summarize(parsed, p => {
    if (p.type === ParsedType.Profile) {
      return profilesByPubkey.get(p.value.pubkey)?.name
    }
  }),
).toString()
```

Text, topics, code, commands, newlines and ellipses pass through untouched. The result composes with `truncate`, `reduceLinks` and either renderer, so `renderAsHtml(summarize(parsed))` names entities and still marks up the prose around them.
