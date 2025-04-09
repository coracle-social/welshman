# Application Context

The `@welshman/app` package uses a global context system to configure a few core behaviors.

## Dufflepud

[Dufflepud](https://github.com/coracle-social/dufflepud) is a utility server that can retrieve NIP 05 profiles, zappers, relay metadata, link previews, etc. It's not necessary for using welshman, but can improve things by bypassing CORS.

```typescript
import {appContext} from '@welshman/app'

appContext.dufflepudUrl = 'https://my-dufflepud-instance.com'
```
