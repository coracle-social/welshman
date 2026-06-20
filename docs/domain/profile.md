# Profile

`Profile` / `ProfileBuilder` model NIP-01 kind-0 metadata — the JSON blob that carries a user's name, picture, NIP-05, lightning address, and so on. Like every kind in `@welshman/domain`, it is a thin pair of classes over the [base Reader/Builder machinery](./readers-and-builders): a read-only view plus a chainable producer of an event template.

The content of a kind-0 event is a JSON object, so `Profile.parse` decodes it into a `values` record and the getters read fields off that.

## Reading

```typescript
import {Profile} from "@welshman/domain"

const profile = await Profile.fromEvent(event)   // no signer needed — kind 0 is not encrypted

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

## Building

Construct empty to author a new profile, or from a reader to edit one. Setters are chainable; finish with `toTemplate()` / `toEvent(signer)`.

```typescript
import {ProfileBuilder} from "@welshman/domain"

const template = await new ProfileBuilder()
  .setName("alice")
  .setAbout("hello nostr")
  .setPicture("https://example.com/avatar.png")
  .setNip05("alice@example.com")
  .toTemplate()             // EventTemplate {kind: 0, content, tags: []}
```

Editing round-trips through the reader. `buildContent` re-serializes `values` to JSON, so unknown profile fields you never touched are preserved:

```typescript
const signed = await profile.builder()
  .setAbout("updated bio")
  .toEvent(signer)         // SignedEvent
```

Available setters: `setName`, `setNip05`, `setAbout`, `setBanner`, `setPicture`, `setWebsite`, plus `update(values)` to merge an arbitrary object into `values`.

```typescript
new ProfileBuilder().update({name: "alice", lud16: "alice@walletofsatoshi.com"})
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

- [Readers & Builders](./readers-and-builders) — the base `EventReader`/`EventBuilder` pattern every kind shares.
