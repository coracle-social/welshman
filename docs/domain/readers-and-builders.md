# Readers & Builders

Every kind in `@welshman/domain` is a thin subclass of four base classes:

- `EventReader` — read-only view over one event.
- `EventBuilder` — mutable producer of an event template.
- `ListReader` — `EventReader` with a public/private (encrypted) tag split.
- `ListBuilder` — `EventBuilder` with the same split, and NIP-44 encryption baked into its build step.

Understanding these four classes means you understand every kind: the per-kind files (`Profile`, `FollowList`, `ZapReceipt`, …) only add getters and setters on top of the machinery described here.

## EventReader

A `Reader` wraps a single `TrustedEvent` and answers questions about it. It is abstract — each kind pins its `kind` and provides a `builder()` — but the construction, parsing, and base getters all live here.

### Construction: factory and fromEvent

You never call the constructor directly to get a parsed reader, because parsing is async. Use one of the two static entry points instead. Both validate the event's kind (throwing `Expected a kind X event, got kind Y` on mismatch) and then `await reader.parse(signer)` before handing the reader back.

```typescript
import {Profile} from "@welshman/domain"

// One-shot: the usual entry point.
const profile = await Profile.fromEvent(event)
const profile2 = await Profile.fromEvent(event, signer)   // signer optional

// Reusable, class-bound factory over a fixed signer. Returns an
// async (event) => Promise<Reader>, safe to use point-free.
const toProfile = Profile.factory(signer)
const profile3 = await toProfile(event)
```

`factory(signer?)` is what `@welshman/app`'s data plugins use as their `eventToItem`: a single bound function that turns each incoming event into a parsed reader. Both `fromEvent` and the function `factory` returns are **async**.

The signer is always optional. A reader that does not need it (every non-list kind) simply ignores it, so callers can pass a signer unconditionally without knowing which kinds carry encrypted content.

### Async parse

```typescript
protected async parse(signer?: ISigner): Promise<void> {}
```

`parse` is the one async hook. The base implementation is a no-op; subclasses override it to decode whatever they need:

- `Profile.parse` JSON-parses `event.content` into a `values` object.
- `ZapReceipt.parse` decodes the embedded zap-request JSON out of the `description` tag.
- `ListReader.parse` decrypts the private tags (see below).

Because `parse` is the only async step, everything downstream — the getters — is synchronous.

### Getters

All base getters are synchronous reads over the wrapped event:

| Getter | Returns |
|---|---|
| `id()` | `event.id` |
| `author()` | `event.pubkey` |
| `content()` | `event.content` |
| `tags()` | `event.tags` (overridden by `ListReader` to merge public + private) |
| `createdAt()` | `event.created_at` |
| `identifier()` | the `d` tag value |
| `address()` | the replaceable address `kind:pubkey:d` (via `getAddress`) |
| `group()` | the NIP-29 `h` tag value |
| `protect()` | `true` if a `["-"]` tag is present |
| `expiration()` | the parsed `expiration` tag as a number, or `undefined` |

```typescript
const reader = await SomeKind.fromEvent(event)
reader.author()         // pubkey
reader.identifier()     // d tag, if any
reader.expiration()     // number | undefined
```

Each subclass adds its own getters on top — `profile.name()`, `followList.pubkeys()`, `zapGoal.amount()`, and so on.

### builder()

```typescript
abstract builder(): EventBuilder<EventReader>
```

Every reader returns its matching builder, pre-populated from itself — internally just `new XBuilder(this)`. This is the read-edit-rebuild bridge:

```typescript
const edited = await profile.builder().setName("alice").toTemplate()
```

## EventBuilder

A `Builder` is a mutable, chainable producer of an `EventTemplate`. Construct it empty to author a new event, or from a reader to edit an existing one. Every setter returns `this`.

### Construction and extra-tag passthrough

```typescript
constructor(readonly reader?: Reader)
```

When you pass a reader, the builder seeds `content` from `reader.event.content` and copies **all** of `event.tags` into `extraTags`. It then *consumes* the tags it manages — `h`, `-`, `expiration`, and `d` — lifting each out of `extraTags` into a dedicated field (`groupTag`, `protectTag`, `expirationTag`, `identifierTag`).

Whatever remains in `extraTags` is **passed through verbatim** when the event is rebuilt. This is the extra-tag passthrough guarantee: tags the package does not model (or a subclass does not claim) survive an edit round-trip instead of being silently dropped.

```typescript
protected consumeTags(key: string): string[][]
```

Subclasses call `consumeTags` in their own constructors to lift the tags they understand out of the passthrough set. For example `RelaySetBuilder` consumes `title`/`description`/`image`, `CommentBuilder` consumes its root/parent ref tags, and `ListBuilder` takes over everything left as `publicTags`.

### Setters

The base behavior setters, all chainable:

```typescript
new SomeBuilder()
  .setContent("…")
  .setGroup(groupId)        // h tag       / clearGroup()
  .setProtected(true)       // ["-"] tag
  .setExpiration(timestamp) //              / clearExpiration()
  .setIdentifier()          // d tag (defaults to a random id) / clearIdentifier()
```

`setIdentifier(identifier = randomId())` defaults to a freshly generated id, which is what you want for new parameterized-replaceable events. Each subclass adds its own setters (`setName`, `addFollow`, `setAmount`, …) on top of these.

### The build pipeline

Subclasses customize the output by overriding two protected hooks (both may be async, both receive the optional signer) and `validate`:

```typescript
protected buildTags(signer?): MaybeAsync<string[][]>   // default: []  — kind-specific tags
protected buildContent(signer?): MaybeAsync<string>    // default: this.content
protected validate(): void                              // default: enforce d tag for replaceable kinds
```

`validate` by default throws `A d tag is required for kind X` for parameterized-replaceable kinds with no identifier. Subclasses call `super.validate()` and add their own checks — `ZapGoal requires a title`, `RoomDelete` requires an `h` group, and so on.

The three output methods assemble these into a result. All are async:

```typescript
const template = await builder.toTemplate(signer?)   // EventTemplate {kind, content, tags}
const rumor    = await builder.toRumor(signer)       // HashedEvent (needs signer for pubkey)
const signed   = await builder.toEvent(signer)       // SignedEvent (signs + stamps)
```

`toTemplate` is the heart of it. It runs `validate()`, then awaits `buildContent`, `buildTags`, and the internal behavior tags in parallel, and concatenates the final tag list as:

```
[...implTags, ...behaviorTags, ...extraTags]
```

That ordering is the passthrough in action: kind-specific tags first, then the group/protect/expiration/identifier tags, then the untouched leftovers.

The signer rules:

- `toTemplate`'s signer is **optional** and only consulted by kinds whose `buildContent`/`buildTags` need it — in practice, the encrypting list kinds.
- `toRumor` and `toEvent` always **require** a signer (they need the author's pubkey, and `toEvent` signs).

```typescript
// Plain kind: no signer needed for a template
const template = await new ProfileBuilder().setName("alice").toTemplate()

// Any kind, signed
const event = await new ProfileBuilder().setName("alice").toEvent(signer)
```

## ListReader

NIP-51-style lists split their tags into a public set and a private (encrypted) set. `ListReader` extends `EventReader` and handles the decryption.

```typescript
decrypted = false
publicTags: string[][] = []
privateTags: string[][] = []
```

Its `parse` override:

1. Sets `publicTags = event.tags`.
2. If `event.content` is empty, there is nothing to decrypt → `decrypted = true`.
3. Otherwise, if a signer is supplied **and it belongs to the event's author** (`signer.getPubkey() === event.pubkey`), it decrypts the content, marks `decrypted = true`, parses the JSON array, and keeps only well-formed string-tuple tags into `privateTags`. A decryption failure is swallowed — `decrypted` simply stays `false`.

The practical consequence: **private tags only appear when you pass the author's own signer** to `fromEvent`/`factory`. Reading someone else's list, or your own list without a signer, gives you the public tags only.

```typescript
const list = await MuteList.fromEvent(event, signer)   // signer = the list author's
list.pubkeys()    // includes both public and private mutes, when decrypted
```

`tags()` is overridden to return `[...publicTags, ...privateTags]`, so every inherited getter that reads `this.tags()` transparently sees the merged view.

## ListBuilder

`ListBuilder` extends `EventBuilder` with the same public/private split and a chainable set of tag mutators. Its constructor takes over the leftover `extraTags` as `publicTags` (`this.publicTags = this.extraTags.splice(0)`) and copies `privateTags` from the reader.

### Tag mutators

All chainable (return `this`):

```typescript
builder
  .addPublic(...tags)        // append to public set
  .addPrivate(...tags)       // append to private (encrypted) set
  .keepPublic(pred)          // filter public to matches; also keepPrivate, keep (both)
  .dropPublic(pred)          // filter out matches; also dropPrivate, drop (both)
  .clearPublic()             // empty the set; also clearPrivate, clear (both)
```

Subclasses build their domain methods on these. For instance `FollowListBuilder.addFollow(tag)` is `addPublic(tag)`, and `MuteListBuilder` exposes `mutePublicly` (public) vs `mutePrivately` (private).

### validate

```typescript
protected validate()
```

`ListBuilder.validate` throws `Unable to modify list when decryption was not performed` if the source event had encrypted content that was never decrypted (because you did not pass the author's signer) yet you are trying to write private tags. This guards against clobbering private data you could not read.

### buildContent: where encryption lives

This is the important part. In the old `@welshman/util` design, encryption was a separate `Encryptable` wrapper you composed around an event. In `@welshman/domain` it is folded directly into the list builder's `buildContent`:

```typescript
protected async buildContent(signer?: ISigner): Promise<string> {
  // Preserve the original ciphertext when we never decrypted it.
  if (this.reader?.decrypted === false) return this.reader.event.content

  // No need to encrypt an empty array
  if (this.privateTags.length === 0) return ""

  if (!signer) {
    throw new Error("A signer is required to encrypt private tags")
  }

  const pubkey = await signer.getPubkey()

  return signer.nip44.encrypt(pubkey, JSON.stringify(this.privateTags))
}
```

Three branches:

1. **Never decrypted** — return the original ciphertext untouched. You can edit public tags on a list you could not decrypt without destroying its private contents.
2. **No private tags** — return `""`. Nothing to encrypt.
3. **Has private tags** — require a signer (else throw `A signer is required to encrypt private tags`), then `signer.nip44.encrypt(pubkey, JSON.stringify(privateTags))`. The encryption is **NIP-44, self-encrypted to the author's own pubkey**.

`buildTags` simply returns `publicTags`. Because encryption happens here and needs the signer, list kinds are the case where `toTemplate(signer)` actually uses its optional argument:

```typescript
import {MuteListBuilder} from "@welshman/domain"

// Private mute → buildContent encrypts, so toTemplate needs the signer
const template = await new MuteListBuilder()
  .mutePrivately(targetPubkey)
  .toTemplate(signer)

// toEvent/toRumor always pass the signer through for you
const signed = await new MuteListBuilder()
  .mutePublicly(targetPubkey)
  .toEvent(signer)
```

## Old API → new API

| Old (`@welshman/util` helpers) | New (`@welshman/domain`) |
|---|---|
| `readProfile(event)` / free `read*` functions | `await Profile.fromEvent(event)` (Reader per kind) |
| `editProfile(...)` / free `create*`/`edit*` functions | `new ProfileBuilder(reader?)` → `toTemplate()/toEvent()` |
| `Encryptable` wrapper around an event | `ListBuilder.buildContent` (NIP-44, self-encrypted) — no separate wrapper |
| manual `signer.nip44.encrypt(...)` for private list tags | `addPrivate(...)` then `toTemplate(signer)` |
| manual `decrypt(...)` to read private tags | pass the author's signer to `fromEvent`/`factory` |
| hand-built `{kind, content, tags}` templates | `builder.toTemplate(signer?)` |
