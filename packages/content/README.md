# @welshman/content [![version](https://badgen.net/npm/v/@welshman/content)](https://npmjs.com/package/@welshman/content)

Utilities for parsing note content.

```typescript
import {parse, render} from '@welshman/content'

const content = "Hello<br>from https://coracle.tools! <script>alert('evil')</script>"
const html = parse({content}).map(render).join("")
// => Hello&lt;br&gt;from <a href="https://coracle.tools/" target="_blank">coracle.tools/</a>! &lt;script&gt;alert('evil')&lt;/script&gt;
```
