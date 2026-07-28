# Profile

`ProfileReader` / `ProfileWriter` model NIP-01 kind-0 metadata — the JSON blob that carries a user's name, picture, NIP-05, lightning address, and so on. Like every kind in `@welshman/domain`, `Profile` is a `KindFactory` pairing a read-only view (`ProfileReader`) with a chainable producer of an event template (`ProfileWriter`) — see the [base Reader/Writer machinery](./readers-and-writers).

You never construct the reader/writer directly. A `KindFactory` is `configure`d **once** with a `KindContext` (resolver, optional signer, optional repository) to yield a `ConfiguredKind`, whose `reader(event)` / `writer(reader?)` build the instances. In an app you get this through the `Domain` plugin; standalone you can configure the factory yourself.

The content of a kind-0 event is a JSON object, so `ProfileReader.parse` decodes it into a `values` record and the getters read fields off that.

## Reading

`ConfiguredKind.reader(event)` validates the event kind and builds the reader; `parse()` populates it. Kind 0 parses synchronously, so there is nothing to await.

```typescript
import {Profile} from "@welshman/domain"

// In an app:
const profile = app.use(Domain).reader(Profile)(event)

// Standalone (kind 0 is not encrypted, so no signer is needed):
const profile = Profile.configure({resolver}).reader(event).parse()

profile.name()            // string | undefined
profile.about()           // string | undefined
profile.picture()         // string | undefined
profile.banner()          // string | undefined
profile.website()         // string | undefined
profile.nip05()           // string | undefined
profile.lnurl()           // lud16/lud06 → lnurl, via parseLnUrl
profile.values            // the raw decoded JSON object
```

`display(fallback = "")` is the best-effort label you usually want in UI. It prefers `name` (truncated to 60 chars via `ellipsize`), and otherwise falls back to a shortened npub:

```typescript
profile.display()             // "alice"  ·  "npub1abc…wxyz"  ·  fallback
profile.display("anonymous")  // fallback used only when there is nothing else
```

## Writing

Get a fresh writer to author a new profile, or seed one from a reader to edit. Setters are chainable; finish with `renderTemplate()` to produce the unsigned `EventTemplate`.

```typescript
import {Profile} from "@welshman/domain"

const configured = Profile.configure({resolver})

const template = await configured.writer()
  .setName("alice")
  .setAbout("hello nostr")
  .setPicture("https://example.com/avatar.png")
  .setNip05("alice@example.com")
  .renderTemplate()       // EventTemplate {kind: 0, content, tags: []}
```

`renderTemplate()` replaces the old `toTemplate()` and takes no arguments. It validates, resolves any in-tag relay hints, and calls `buildContent` — which for profiles re-serializes `values` to JSON, so unknown profile fields you never touched are preserved. The caller signs the template.

Editing round-trips through the reader — pass it to `writer(reader)` to seed `values` from the existing event:

```typescript
const writer = configured.writer(profile).setAbout("updated bio")

// Sign the rendered template yourself...
const signed = await signer.sign(stamp(await writer.renderTemplate()))

// ...or, in an app, hand the writer to Domain.command to finalize + publish:
const command = await app.use(Domain).command(configured.writer(profile).setAbout("updated bio"))
await command.publish()
```

Available setters: `setName`, `setNip05`, `setAbout`, `setBanner`, `setPicture`, `setWebsite`, plus `update(values)` to merge an arbitrary object into `values`.

```typescript
configured.writer().update({name: "alice", lud16: "alice@walletofsatoshi.com"})
```

## Free functions

`Profile.ts` also exports two standalone helpers, used internally by the getters above but available on their own:

```typescript
import {parseLnUrl, displayPubkey} from "@welshman/domain"

// Resolve an lnurl from a metadata object: checks lud06 then lud16.
parseLnUrl({lud16: "alice@example.com"})   // string | undefined

// A short, human-readable npub: first 8 chars + "…" + last 5.
displayPubkey(pubkey)                       // "npub1abc…wxyz"
```

## See also

- [Readers & Writers](./readers-and-writers) — the base `EventReader`/`EventWriter` pattern every kind shares, plus `KindFactory` / `configure` / `ConfiguredKind`.
