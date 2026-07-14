# Readers & Writers

Every kind in `@welshman/domain` is a thin subclass of four base classes:

- `EventReader` — read-only view over one event.
- `EventWriter` — mutable producer of an event template.
- `ListReader` — `EventReader` with a public/private (encrypted) tag split.
- `ListWriter` — `EventWriter` with the same split, and NIP-44 encryption baked into its build step.

Understanding these four classes means you understand every kind: the per-kind files (`Profile`, `FollowList`, `ZapReceipt`, …) only add getters and setters on top of the machinery described here.

## Configuring a kind

Readers and writers need dependencies — a `Resolver` to turn abstract relay routes into urls, an optional `ISigner` for encryption/decryption, and an optional `Repository` so routers can find event parents. Those are bundled in a `KindContext`:

```typescript
export type KindContext = {
  resolver: Resolver          // from @welshman/util
  signer?: ISigner            // from @welshman/signer
  repository?: Repository     // from @welshman/net
}
```

Each exported kind is a `KindFactory` — the pairing of a reader class and a writer class, with no dependencies bound yet:

```typescript
export const Profile = new KindFactory({reader: ProfileReader, writer: ProfileWriter})
```

You bind dependencies **once** with `configure(context)`, which returns a `ConfiguredKind`. The configured kind is your entry point for building readers and writers:

```typescript
import {Profile} from "@welshman/domain"

const profile = Profile.configure(context)   // ConfiguredKind

const reader = await profile.reader(event)    // parsed reader (async)
const writer = profile.writer()               // fresh writer
const writer2 = profile.writer(reader)         // writer seeded from a reader (edit)
```

`reader`, `writer`, and `router` are instance arrow-function properties, so they are safe to destructure or pass point-free.

In `@welshman/app` you never call `configure` yourself — the `Domain` plugin does it for you, memoized per factory, wiring in the app's `Router.resolver`, `repository`, and a lazy `signer`. See [With `@welshman/app`](#with-welshmanapp-domain--command) below.

## EventReader

A `Reader` wraps a single `TrustedEvent` and answers questions about it. It is abstract — each kind pins its `kind` — but the construction, parsing, and base getters all live here.

### Construction and parse

You get a parsed reader from `ConfiguredKind.reader(event)`, which is **async** because parsing may be. It validates the event's kind (throwing `Expected a kind X event, got kind Y` on mismatch), constructs the reader, and `await`s `reader.parse()` before handing it back.

```typescript
import {Profile} from "@welshman/domain"

const profile = await Profile.configure(context).reader(event)
```

```typescript
protected async parse(): Promise<void> {}
```

`parse` is the one async hook. It takes **no arguments** — a subclass that needs the signer reads it from `this.def.context.signer`. The base implementation is a no-op; subclasses override it to decode whatever they need:

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
const reader = await SomeKind.configure(context).reader(event)
reader.author()         // pubkey
reader.identifier()     // d tag, if any
reader.expiration()     // number | undefined
```

Each subclass adds its own getters on top — `profile.name()`, `followList.pubkeys()`, `zapGoal.amount()`, and so on.

### Routing a reader

A reader can compute where the event should be fetched from. The default `routes()` branches on whether it is a group event:

```typescript
protected routes(): MaybeAsync<RelaySelection[]> {
  return [this.group() ? seen(this.event) : outbox(this.author())]
}

async scenario(): Promise<RelayScenario> {
  return this.def.context.resolver.scenario(await this.routes())
}
```

A group (`h`-tagged) event routes to the relays it was seen on; otherwise it routes to its author's outbox. `scenario()` resolves those routes through the configured `Resolver` into a `RelayScenario`.

## EventWriter

A `Writer` is a mutable, chainable producer of an `EventTemplate`. Get an empty one with `configuredKind.writer()` to author a new event, or seed one from a reader with `configuredKind.writer(reader)` to edit an existing one. Every setter returns `this`.

### Construction and extra-tag passthrough

```typescript
constructor(readonly def: AnyConfiguredKind, readonly reader?: Reader)
```

When you pass a reader, the writer seeds `content` from `reader.event.content` and copies **all** of `event.tags` into `extraTags`. It then *consumes* the tags it manages — `h`, `-`, `expiration`, and `d` — lifting each out of `extraTags` into a dedicated field (`groupTag`, `protectTag`, `expirationTag`, `identifierTag`).

Whatever remains in `extraTags` is **passed through verbatim** when the event is rebuilt. This is the extra-tag passthrough guarantee: tags the package does not model (or a subclass does not claim) survive an edit round-trip instead of being silently dropped.

```typescript
protected consumeTags(key: string): Tag[]
```

Subclasses call `consumeTags` in their own constructors to lift the tags they understand out of the passthrough set. For example `ListWriter` takes over everything left as `publicTags`.

### Setters

The base behavior setters, all chainable:

```typescript
someKind.writer()
  .setContent("…")
  .setGroup(relayUrl, groupId)   // h tag + forcedRelays / clearGroup()
  .setProtected(true)            // ["-"] tag
  .setExpiration(timestamp)      //         / clearExpiration()
  .setIdentifier()               // d tag (defaults to a random id) / clearIdentifier()
```

`setIdentifier(identifier = randomId())` defaults to a freshly generated id, which is what you want for new parameterized-replaceable events. Each subclass adds its own setters (`setName`, `follow`, `setAmount`, …) on top of these.

Free-form tags can be added and filtered directly:

```typescript
writer
  .addTags(["t", "nostr"])        // append to extraTags
  .keepTags(tag => tag[0] !== "t") // keep matching
  .dropTags(tag => tag[0] === "t") // drop matching
```

### Shared tag / hint helpers

Several helpers emit tags carrying a **relay hint** — a deferred `Hint` occupying the relay-hint slot, which `render()` later dereferences to a single url:

```typescript
writer.tagPubkey(pubkey, petname?)      // ["p", pubkey, <hint>, petname]
writer.addQuote(event, relay?)          // ["q", id, relay ?? <hint>, pubkey]
writer.addZapSplit(pubkey, split = 1)   // ["zap", pubkey, <hint>, String(split)]
```

### The build pipeline

Subclasses customize the output by overriding two protected hooks (both may be async, both receive the optional signer) and `validate`:

```typescript
protected buildTags(signer?): MaybeAsync<Tag[]>        // default: []  — kind-specific tags
protected buildContent(signer?): MaybeAsync<string>    // default: this.content
protected validate(): void
```

`validate` by default throws:

- `A d tag is required for kind X` for parameterized-replaceable kinds with no identifier;
- `A group event requires a relay url (set the group via setGroup)` when a `groupTag` is set but `forcedRelays` is empty;
- `A kind X event must publish to explicit relays (via setGroup or forceRelays)` when `requiresRelays` is true but `forcedRelays` is empty.

Subclasses call `super.validate()` and add their own checks — `DeleteWriter` requires at least one `e`/`a` tag, and so on.

Tags are assembled as:

```
[...buildTags(), ...behaviorTags, ...extraTags]
```

where `behaviorTags` are the present ones among `groupTag`, `protectTag`, `expirationTag`, `identifierTag`. That ordering is the passthrough in action: kind-specific tags first, then the behavior tags, then the untouched leftovers.

### Output methods

There is no `toTemplate`/`toEvent`/`toRumor` on the writer. Instead it produces an unsigned template, and the caller signs it. All are async and take **no** arguments — the context (signer, resolver) was injected at `configure`:

```typescript
const template = await writer.render()     // EventTemplate {kind, content, tags}
const relays   = await writer.relays()     // string[] — where to publish
const {event, relays} = await writer.finalize()   // both at once
```

`render()` is the heart of it: it runs `validate()`, resolves every in-tag `Hint` to a single url via `context.resolver.relay(...)` (falling back to `""`), builds the content (encrypting for list kinds), and returns `{kind, content, tags}`.

To sign, hand the template to a signer — this is what the app and the test helpers do:

```typescript
import {stamp} from "@welshman/util"

const signed = await signer.sign(stamp(await writer.render()))
```

### Routing a writer

A writer computes where the event should be published. The default `routes()` targets the author's outbox plus every p-tagged pubkey's inbox:

```typescript
protected async routes(): Promise<RelaySelection[]> {
  return [userOutbox(), ...inboxes(getPubkeyTagValues(await this.getTags()), 0.5)]
}
```

`getTags()` returns the fully-assembled tags with every `Hint` rendered as `""` — a synchronous view used purely for routing. `scenario()`/`relays()` resolve these routes through the configured `Resolver`.

Kinds override `routes()` when the default is wrong. For instance `FollowListWriter` and `MuteListWriter` route to `[userOutbox()]` only (their p-tags are data, not recipients), and `DeleteWriter` adds each deleted event's seen relays.

### Forced relays and required relays

Some events must go to specific relays regardless of outbox/inbox routing — NIP-29 group events, relay-management ops, and so on. Two mechanisms cover this:

```typescript
writer.setGroup(url, group)       // forcedRelays = [url]  AND  h tag = ["h", group]
writer.forceRelays(...urls)       // forcedRelays = urls   (no h tag)
writer.clearGroup()               // clears both
writer.clearForcedRelays()        // clears forcedRelays
```

When `forcedRelays` is non-empty, `scenario()` publishes **only** to those relays, bypassing `routes()` entirely.

A kind can also declare it *requires* explicit relays by overriding the readonly field:

```typescript
readonly requiresRelays = true
```

`validate()` then refuses to render until `forcedRelays` is set (via `setGroup` or `forceRelays`). The kinds that set this are all NIP-29 room ops/state and all relay-management ops/state — `RoomCreate`, `RoomEdit`, `RoomDelete`, `RoomJoin`, `RoomLeave`, `RoomAddMember`, `RoomRemoveMember`, `RoomMembers`, `RoomAdmins`, `RoomMeta`, `RoomCreatePermission`, `RelayJoin`, `RelayLeave`, `RelayInvite`, `RelayAddMember`, `RelayRemoveMember`, `RelayRole`, and `RelayMembers`. (`RoomCreate` additionally requires a `groupTag`.)

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
3. Otherwise, if a signer is configured **and it belongs to the event's author** (`signer.getPubkey() === event.pubkey`), it decrypts the content, marks `decrypted = true`, parses the JSON array, and keeps only well-formed string-tuple tags into `privateTags`. A decryption failure is swallowed — `decrypted` simply stays `false`.

The practical consequence: **private tags only appear when the configured signer is the list author's**. Reading someone else's list, or your own list without a signer, gives you the public tags only.

```typescript
// context.signer must be the list author's for private tags to decrypt
const list = await MuteList.configure(context).reader(event)
list.pubkeys()    // includes both public and private mutes, when decrypted
```

`tags()` is overridden to return `[...publicTags, ...privateTags]`, so every inherited getter that reads `this.tags()` transparently sees the merged view.

## ListWriter

`ListWriter` extends `EventWriter` with the same public/private split and a chainable set of tag mutators. Its constructor takes over the leftover `extraTags` as `publicTags` (`this.publicTags = this.extraTags.splice(0)`) and copies `privateTags` from the reader.

### Tag mutators

All chainable (return `this`):

```typescript
writer
  .addPublic(...tags)        // append to public set
  .addPrivate(...tags)       // append to private (encrypted) set
  .keepPublic(pred)          // filter public to matches; also keepPrivate, keepTags (both)
  .dropPublic(pred)          // filter out matches; also dropPrivate, dropTags (both)
```

Subclasses build their domain methods on these. For instance `MuteListWriter` exposes `mutePublicly` (public) vs `mutePrivately` (private), and `RoomListWriter` exposes `addGroup`/`removeGroup`/`addRelay`/`removeRelay`.

### validate

```typescript
protected validate()
```

`ListWriter.validate` throws `Unable to modify list when decryption was not performed` if the source event had encrypted content that was never decrypted (because the configured signer was not the author's) yet you are trying to write private tags. This guards against clobbering private data you could not read.

### buildContent: where encryption lives

This is the important part. In the old `@welshman/util` design, encryption was a separate `Encryptable` wrapper you composed around an event. In `@welshman/domain` it is folded directly into the list writer's `buildContent`:

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

`buildTags` simply returns `publicTags`. The signer used here comes from `def.context.signer`, injected at `configure`:

```typescript
import {MuteList} from "@welshman/domain"

// context.signer is the author's; render() encrypts the private tag
const template = await MuteList.configure(context)
  .writer()
  .mutePrivately(targetPubkey)
  .render()
```

## With `@welshman/app`: Domain & Command

The `Domain` plugin owns the `KindContext`, so app code never touches `configure`. It exposes three helpers:

```typescript
const domain = app.use(Domain)

// Read side — pass as a data plugin's eventToItem decoder:
eventToItem: domain.reader(Note)

// Write side:
const writer = domain.writer(FollowList, existingReader).follow(pubkey)
const command = await domain.command(writer)   // requires a signed-in user
command.publish()
```

- `domain.reader(factory)` returns the configured kind's async `reader` function.
- `domain.writer(factory, reader?)` returns a fresh writer, optionally seeded for editing.
- `domain.command(writer)` requires the signed-in user, calls `writer.finalize()`, and wraps the `{event, relays}` in a `Command` you can `.publish()`.

The context `Domain` builds wires in `app.use(Router).resolver`, `app.repository`, and a **lazy** `signer` getter (so auth policies can swap the signer after configuration).

## Old API → new API

| Old (`@welshman/domain`) | New (`@welshman/domain`) |
|---|---|
| `new Kind({reader, builder, router})` | `new KindFactory({reader, writer, router?})` |
| `EventBuilder` / `ListBuilder` / `XBuilder` | `EventWriter` / `ListWriter` / `XWriter` |
| `X.fromEvent(event)` / `Kind.read(event)` / `Kind.factory(signer)` | `factory.configure(ctx).reader(event)` (async) |
| `Kind.builder(reader?)` / `new XBuilder(reader?)` | `factory.configure(ctx).writer(reader?)` |
| `parse(signer)` | `parse()` (reads `def.context.signer`) |
| `builder.toTemplate(signer?)` | `writer.render()` (context injected at `configure`) |
| `builder.toEvent(signer)` | `signer.sign(stamp(await writer.render()))` |
| `builder.toRumor(signer)` | `prep(await writer.render(), await signer.getPubkey())` |
| `builder.finalize(context)` | `writer.finalize()` (no arg) |
| `Router.commandFromBuilder(builder)` | `app.use(Domain).command(writer)` |
| `Encryptable` wrapper around an event | `ListWriter.buildContent` (NIP-44, self-encrypted) — no separate wrapper |
