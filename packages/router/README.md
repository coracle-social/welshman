# @welshman/content [![version](https://badgen.net/npm/v/@welshman/content)](https://npmjs.com/package/@welshman/content)

Utilities for parsing and rendering note content. Customizable via RenderOptions.

```typescript
import {parse, render} from '@welshman/content'

const content = "Hello<br>from https://coracle.tools! <script>alert('evil')</script>"
const parsed = parse({content, tags: []})
// [
//   { type: 'text', value: 'Hello<br>from ', raw: 'Hello<br>from ' },
//   {
//     type: 'link',
//     value: { url: URL, isMedia: false },
//     raw: 'https://coracle.tools'
//   },
//   {
//     type: 'text',
//     value: "! <script>alert('evil')</script>",
//     raw: "! <script>alert('evil')</script>"
//   }
// ]

const result = renderAsText(parsed)
// => Hello&lt;br&gt;from https://coracle.tools/! &lt;script&gt;alert('evil')&lt;/script&gt;

const result = renderAsHtml(parsed)
// => Hello&lt;br&gt;from <a href="https://coracle.tools/" target="_blank">coracle.tools/</a>! &lt;script&gt;alert('evil')&lt;/script&gt;
```
