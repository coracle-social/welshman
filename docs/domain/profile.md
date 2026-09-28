# Profile

`ProfileReader` / `ProfileWriter` model NIP-01 kind-0 metadata, the JSON object that carries a user's name, picture, NIP-05, lightning address, and so on. `Profile` is the `KindFactory` that bundles them; see [Readers & Writers](./readers-and-writers) for how a factory is configured.

`ProfileReader.parse` decodes the event content into a `values` record, and the getters read fields off that.

## Reading

Kind 0 parses synchronously, so there is nothing to await.

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
profile.lnurl()           // lud06/lud16 → lnurl, via parseLnUrl
profile.values            // the raw decoded JSON object
```

`display()` is the label to use in UI. It prefers `name`, truncated to 60 characters, and otherwise falls back to a shortened npub:

```typescript
profile.display()             // "alice"  ·  "npub1abc…wxyz"
```

## Writing

Setters are chainable, and `renderTemplate()` produces the unsigned `EventTemplate`:

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

`renderContent` re-serializes `values` to JSON, so profile fields the writer never touched are preserved. Pass a reader to `writer(reader)` to seed `values` from an existing event:

```typescript
const writer = configured.writer(profile).setAbout("updated bio")

// Sign the rendered template yourself...
const signed = await signer.sign(stamp(await writer.renderTemplate()))

// ...or, in an app, hand the writer to Domain.command to publish it:
const command = await app.use(Domain).command(writer)
await command.publish()
```

The setters are `setName`, `setNip05`, `setAbout`, `setBanner`, `setPicture`, `setWebsite`, plus `update(values)` to merge an arbitrary object into `values`.

```typescript
configured.writer().update({name: "alice", lud16: "alice@walletofsatoshi.com"})
```

## Free functions

`Profile.ts` also exports two standalone helpers:

```typescript
import {parseLnUrl, displayPubkey} from "@welshman/domain"

// Resolve an lnurl from a metadata object: checks lud06 then lud16.
parseLnUrl({lud16: "alice@example.com"})   // string | undefined

// A short, human-readable npub: first 8 chars + "…" + last 5.
displayPubkey(pubkey)                       // "npub1abc…wxyz"
```

## See also

- [Readers & Writers](./readers-and-writers) — the base `EventReader`/`EventWriter` pattern every kind shares, plus `KindFactory` / `configure` / `ConfiguredKind`.
