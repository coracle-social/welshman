# Handlers

NIP-89 lets clients advertise which event kinds they can handle, and lets users recommend handlers to each other. `@welshman/domain` models both: `Handler` (the handler's own information) and `HandlerRecommendation` (a user pointing at a handler). Both are parameterized-replaceable, so their writers need a `d` tag (`setIdentifier()`), and both parse synchronously. See [Readers & Writers](./readers-and-writers) for the base pattern.

## Handler information (kind 31990)

`Handler` carries a JSON metadata object (name, about, picture, …) in its content, plus the kinds it handles as `k` tags. The metadata shape is exported as `HandlerMeta`.

```typescript
import {Handler} from "@welshman/domain"
import type {HandlerMeta} from "@welshman/domain"

const handler = Handler.configure(context).reader(event).parse()
handler.name()       // string | undefined
handler.about()      // string | undefined
handler.picture()    // string | undefined
handler.website()    // string | undefined
handler.lud16()      // string | undefined
handler.nip05()      // string | undefined
handler.kinds()      // number[] — the k tags, as numbers
handler.values       // the raw decoded HandlerMeta object
```

The writer seeds `values` from the reader and lifts the `k` tags into its own field. Its setters mirror the getters, and `setKinds` takes an array of kind numbers.

```typescript
const {event, relays} = await Handler.configure(context)
  .writer()
  .setIdentifier()                     // required d tag for kind 31990
  .setName("My Client")
  .setAbout("a great nostr app")
  .setKinds([1, 30023])                // writes ["k", "1"], ["k", "30023"]
  .render()                            // sign `event` yourself
```

The setters are `setName`, `setAbout`, `setPicture`, `setWebsite`, `setLud16`, `setNip05`, and `setKinds(kinds)`. `renderContent` re-serializes `values` to JSON, and `renderDomainTags` emits the `k` tags.

## Handler recommendation (kind 31989)

`HandlerRecommendation` is a list of `a` tags pointing at handler events, optionally annotated with a relay hint and a platform marker such as `"web"`.

```typescript
import {HandlerRecommendation} from "@welshman/domain"

const rec = HandlerRecommendation.configure(context).reader(event).parse()
rec.addressTags()     // raw a-tags, e.g. [["a", "31990:pk:d", "wss://…", "web"]]
rec.addresses()       // just the address values
rec.handlerAddress()  // prefers the a-tag whose last element is "web", else the first → tag[1]

const {event} = await HandlerRecommendation.configure(context)
  .writer()
  .setIdentifier()                                  // required d tag for kind 31989
  .addRecommendation("31990:pubkey:d", "wss://relay.example", "web")
  .render()
```

`addRecommendation(address, relay?, platform?)` writes `["a", address, relay || "", platform || ""]`, replacing any tag for the same address. `removeRecommendation(address)` drops the matching address tags.

## Client attribution (the `client` tag)

NIP-89's `client` tag names the app that published an event, optionally pointing at that app's kind-31990 handler event so a reader can look up its name, icon, and website. Any kind can carry it, so every reader exposes it and every writer can set it.

```typescript
import {getClient} from "@welshman/domain"
import type {Client} from "@welshman/domain"

reader.client()      // {name, address?, relay?} | undefined
getClient(event)     // the same, off a bare event
```

An address or relay hint that doesn't parse is dropped, so `client.address` is always safe to hand to `Address.from`.

```typescript
const {event} = await Note.configure(context)
  .writer()
  .setContent("hello")
  .setClient("Coracle", "31990:pubkey:coracle")
  .render()

event.tags   // [["client", "Coracle", "31990:pubkey:coracle", "wss://…"]]
```

The address is optional, so `setClient("Coracle")` writes a bare `["client", "Coracle"]`. When an address is given, the handler author's outbox fills the relay hint slot. `clearClient()` drops the tag, and a writer seeded from a reader keeps whatever `client` tag the event already had.

The tag tells relays and readers which app a pubkey uses, so let users turn it off, and leave it off direct messages.

## With `@welshman/app`

The `Domain` plugin configures the kind for you:

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
