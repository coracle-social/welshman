# Handlers

NIP-89 lets clients advertise which event kinds they can handle, and lets users recommend handlers to each other. `@welshman/domain` models both sides: `Handler` (the handler's own information) and `HandlerRecommendation` (a user pointing at a handler). Both are parameterized-replaceable, so their writers need a `d` tag (`setIdentifier()`). See [Readers & Writers](./readers-and-writers) for the base pattern.

Both kinds are `KindFactory` instances — you `configure(context)` a factory once to get a `ConfiguredKind`, then call `.reader(event)` (async) or `.writer(reader?)` on it. In `@welshman/app`, the `Domain` plugin owns the context for you.

## Handler information (kind 31990)

`Handler` carries a JSON metadata blob (name, about, picture, …) in its content plus the list of kinds it handles as `k` tags. The metadata shape is exported as `HandlerMeta`.

```typescript
import {Handler} from "@welshman/domain"
import type {HandlerMeta} from "@welshman/domain"

const handler = await Handler.configure(context).reader(event)
handler.name()       // string | undefined
handler.about()      // string | undefined
handler.picture()    // string | undefined
handler.website()    // string | undefined
handler.lud16()      // string | undefined
handler.nip05()      // string | undefined
handler.kinds()      // number[] — the k tags, as numbers
handler.values       // the raw decoded HandlerMeta object
```

The writer seeds metadata from the reader and lifts the `k` tags into its own field. Setters mirror the getters; `setKinds` takes an array of kind numbers.

```typescript
const template = await Handler.configure(context)
  .writer()
  .setIdentifier()                     // required d tag for kind 31990
  .setName("My Client")
  .setAbout("a great nostr app")
  .setKinds([1, 30023])                // writes ["k", "1"], ["k", "30023"]
  .render()                            // -> EventTemplate; sign it yourself
```

Available setters: `setName`, `setAbout`, `setPicture`, `setWebsite`, `setLud16`, `setNip05`, `setKinds(kinds)`. `buildContent` re-serializes `values` to JSON; `buildTags` emits the kind tags.

## Handler recommendation (kind 31989)

`HandlerRecommendation` is a list of `a` tags pointing at handler events, optionally annotated with a relay hint and a platform marker (e.g. `"web"`).

```typescript
import {HandlerRecommendation} from "@welshman/domain"

const rec = await HandlerRecommendation.configure(context).reader(event)
rec.addressTags()     // raw a-tags, e.g. [["a", "31990:pk:d", "wss://…", "web"]]
rec.addresses()       // just the address values
rec.handlerAddress()  // prefers the a-tag whose last element is "web", else the first → tag[1]

const template = await HandlerRecommendation.configure(context)
  .writer()
  .setIdentifier()                                  // required d tag for kind 31989
  .addRecommendation("31990:pubkey:d", "wss://relay.example", "web")
  .render()
```

`addRecommendation(address, relay?, platform?)` writes `["a", address, relay || "", platform || ""]` and is deduped by address. `removeRecommendation(address)` drops the matching address tags.

## With `@welshman/app`

In app code you don't call `configure` yourself — the `Domain` plugin bundles the context and memoizes the configured kind:

```typescript
const domain = app.use(Domain)

// read side — pass as a data plugin's eventToItem decoder:
eventToItem: domain.reader(Handler)

// write side:
const writer = domain.writer(Handler).setIdentifier().setName("My Client")
const command = await domain.command(writer)   // requires a signed-in user
command.publish()
```

## See also

- [Readers & Writers](./readers-and-writers) — the base pattern, including `d`-tag validation for these parameterized-replaceable kinds.
