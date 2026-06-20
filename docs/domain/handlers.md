# Handlers

NIP-89 lets clients advertise which event kinds they can handle, and lets users recommend handlers to each other. `@welshman/domain` models both sides: `Handler` (the handler's own information) and `HandlerRecommendation` (a user pointing at a handler). Both are parameterized-replaceable, so their builders need a `d` tag (`setIdentifier()`). See [Readers & Builders](./readers-and-builders) for the base pattern.

## Handler information (kind 31990)

`Handler` carries a JSON metadata blob (name, about, picture, …) in its content plus the list of kinds it handles as `k` tags. The metadata shape is exported as `HandlerMeta`.

```typescript
import {Handler, HandlerBuilder} from "@welshman/domain"
import type {HandlerMeta} from "@welshman/domain"

const handler = await Handler.fromEvent(event)
handler.name()       // string | undefined
handler.about()      // string | undefined
handler.picture()    // string | undefined
handler.website()    // string | undefined
handler.lud16()      // string | undefined
handler.nip05()      // string | undefined
handler.kinds()      // number[] — the k tags, as numbers
handler.values       // the raw decoded HandlerMeta object
```

The builder seeds metadata from the reader and lifts the `k` tags into its own field. Setters mirror the getters; `setKinds` takes an array of kind numbers.

```typescript
const template = await new HandlerBuilder()
  .setIdentifier()                     // required d tag for kind 31990
  .setName("My Client")
  .setAbout("a great nostr app")
  .setKinds([1, 30023])                // writes ["k", "1"], ["k", "30023"]
  .toTemplate()
```

Available setters: `setName`, `setAbout`, `setPicture`, `setWebsite`, `setLud16`, `setNip05`, `setKinds(kinds)`. `buildContent` re-serializes `values` to JSON; `buildTags` emits the kind tags.

## Handler recommendation (kind 31989)

`HandlerRecommendation` is a list of `a` tags pointing at handler events, optionally annotated with a relay hint and a platform marker (e.g. `"web"`).

```typescript
import {HandlerRecommendation, HandlerRecommendationBuilder} from "@welshman/domain"

const rec = await HandlerRecommendation.fromEvent(event)
rec.addressTags()     // raw a-tags, e.g. [["a", "31990:pk:d", "wss://…", "web"]]
rec.addresses()       // just the address values
rec.handlerAddress()  // prefers the a-tag whose last element is "web", else the first → tag[1]

const template = await new HandlerRecommendationBuilder()
  .setIdentifier()                                  // required d tag for kind 31989
  .addRecommendation("31990:pubkey:d", "wss://relay.example", "web")
  .toTemplate()
```

`addRecommendation(address, relay?, platform?)` writes `["a", address, relay || "", platform || ""]` and is deduped by address. `removeRecommendation(address)` filters the address tags.

## See also

- [Readers & Builders](./readers-and-builders) — the base pattern, including `d`-tag validation for these parameterized-replaceable kinds.
