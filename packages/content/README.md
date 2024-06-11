# @welshman/content [![version](https://badgen.net/npm/v/@welshman/content)](https://npmjs.com/package/@welshman/content)

Utilities for parsing note content.

```typescript
import {truncate, parse, render} from '@welshman/content'

const content = "Hello<br>from https://coracle.tools! <script>alert('evil')</script>"
const html = truncate(parse({content})).map(render).join("")
// =>
```
