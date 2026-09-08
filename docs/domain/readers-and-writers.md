# Readers & Writers

Every kind in `@welshman/domain` is a thin subclass of five base classes:

- `EventReader` — read-only view over one event.
- `EventWriter` — mutable producer of an event template.
- `EventQuery` — mutable producer of the filters that fetch the kind's events.
- `ListReader` — `EventReader` with a public/private (encrypted) tag split.
- `ListWriter` — `EventWriter` with the same split, and NIP-44 encryption baked into its build step.

Understanding these five classes means you understand every kind: the per-kind files (`Profile`, `FollowList`, `ZapReceipt`, …) only add getters and setters on top of the machinery described here.

## Configuring a kind

Readers and writers need dependencies — a `Resolver` to turn abstract relay routes into urls, an optional `ISigner` for encryption/decryption, and an optional `Repository` so routers can find event parents. Those are bundled in a `KindContext`:

```typescript
export type KindContext = {
  resolver: Resolver          // from @welshman/util
  signer?: ISigner            // from @welshman/signer
  repository?: Repository     // from @welshman/net
}
```

Each exported kind is a `KindFactory` — a kind number bundled with its reader, writer, and query classes, with no dependencies bound yet:

```typescript
export const Profile = new KindFactory({
  kind: PROFILE,
  reader: ProfileReader,
  writer: ProfileWriter,
  query: ProfileQuery,
})
```

You bind dependencies **once** with `configure(context)`, which returns a `ConfiguredKind`. The configured kind is your entry point for building readers, writers, and queries:

```typescript
import {Profile} from "@welshman/domain"

const profile = Profile.configure(context)   // ConfiguredKind

const reader = profile.reader(event).parse()  // reader, parsed
const writer = profile.writer()               // fresh writer
const writer2 = profile.writer(reader)         // writer seeded from a reader (edit)
const query = profile.query()                 // fresh query
```

`reader`, `writer`, and `query` are instance arrow-function properties, so they are safe to destructure or pass point-free.

In `@welshman/app` you never call `configure` yourself — the `Domain` plugin does it for you, memoized per factory, wiring in the app's `Router.resolver`, `repository`, and a lazy `signer`. See [With `@welshman/app`](#with-welshmanapp-domain--command) below.

## EventReader

A `Reader` wraps a single `TrustedEvent` and answers questions about it. It is abstract — each kind pins its `kind` — but the construction, parsing, and base getters all live here.

### Construction and parse

`ConfiguredKind.reader(event)` validates the event's kind (throwing `Expected a kind X event, got kind Y` on mismatch) and constructs the reader **unparsed**. Chain `parse()` to populate it — it returns the reader, so you keep reading straight off the call:

```typescript
import {Profile, MuteList} from "@welshman/domain"

// Most kinds parse without IO, so there is nothing to await
const profile = Profile.configure(context).reader(event).parse()

// Kinds that decrypt return a promise, and the type makes you await it
const mutes = await MuteList.configure(context).reader(event).parse()
```

Whether `parse()` is async is a property of the kind, declared by the base class its reader extends:

```typescript
abstract class EventReader extends BaseEventReader {
  parse(): this           // no IO — Profile, Note, RelayList, …
}

abstract class AsyncEventReader extends BaseEventReader {
  abstract parse(): Promise<this>  // decrypts — the ListReader kinds, AppData
}
```

Only the six private-tag lists (`ListReader` subclasses) and `AppDataReader` are async; the other 46 kinds parse synchronously. Code that doesn't know the kind can always write `await kind.reader(event).parse()` — awaiting a non-promise is a no-op — and the exported `Parsed<R>` type names whichever result a given reader yields.

`parse` takes **no arguments** — a subclass that needs the signer reads it from `this.context.signer`. The base implementation is a no-op; subclasses override it to decode what they need and return `this`:

- `ProfileReader.parse` JSON-parses `event.content` into a `values` object.
- `ZapReceiptReader.parse` decodes the embedded zap-request JSON out of the `description` tag.
- `ListReader.parse` decrypts the private tags (see below).

Everything downstream — the getters — is synchronous either way.

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
| `room()` | the NIP-29 `h` tag value |
| `protect()` | `true` if a `["-"]` tag is present |
| `expiration()` | the parsed `expiration` tag as a number, or `undefined` |
| `contentWarning()` | `true` if a NIP-36 `content-warning` tag is present |
| `contentWarningReason()` | that tag's reason, or `undefined` when it was tagged bare |
| `client()` | the NIP-89 `client` tag as a `Client`, or `undefined` |

```typescript
const reader = await SomeKind.configure(context).reader(event).parse()
reader.author()         // pubkey
reader.identifier()     // d tag, if any
reader.expiration()     // number | undefined
reader.contentWarning() // boolean
```

The getters for tags any kind can carry delegate to standalone functions in `src/behaviors/`. Import those directly when you hold a bare event and no reader for its kind, since `reader()` throws on a kind mismatch:

```typescript
import {isProtected, getExpiration, getContentWarning, getClient} from "@welshman/domain"

isProtected(event)        // boolean
getExpiration(event)      // number | undefined
getContentWarning(event)  // {reason?: string} | undefined — the reason is optional
getClient(event)          // Client | undefined
```

`getEmojis` and `getZapSplits` back `emojis()` and `zapSplits()` the same way.

Each subclass adds its own getters on top — `profile.name()`, `followList.pubkeys()`, `zapGoal.amount()`, and so on.

Readers are getter-only — they do not compute routes. Where to publish an event is the writer's concern; where to fetch a kind's events is the query's.

A room (`h`-tagged) event routes to the relays it was seen on; otherwise it routes to its author's outbox. `scenario()` resolves those routes through the configured `Resolver` into a `RelayScenario`.

## EventWriter

A `Writer` is a mutable, chainable producer of an `EventTemplate`. Get an empty one with `configuredKind.writer()` to author a new event, or seed one from a reader with `configuredKind.writer(reader)` to edit an existing one. Every setter returns `this`.

### Construction and extra-tag passthrough

```typescript
constructor(readonly def: AnyConfiguredKind, readonly reader?: Reader)
```

When you pass a reader, the writer seeds `content` from `reader.event.content` and copies **all** of `event.tags` into `extraTags`. It then *consumes* the tags it manages — `h`, `-`, `expiration`, `content-warning`, `client`, and `d` — lifting each out of `extraTags` into a dedicated field (`roomTag`, `protectTag`, `expirationTag`, `contentWarningTag`, `clientTag`, `identifierTag`).

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
  .setRoom(relayUrl, roomId)   // h tag + forcedRoutes / clearRoom()
  .setProtected(true)            // ["-"] tag
  .setExpiration(timestamp)      //         / clearExpiration()
  .setContentWarning("nudity")   // NIP-36 tag, reason optional / clearContentWarning()
  .setClient("Coracle")          // NIP-89 tag, handler address optional / clearClient()
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
writer.setClient(name, address?)        // ["client", name, address, <hint>]
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
- `A room event requires a relay url (set the room via setRoom)` when a `roomTag` is set but `forcedRoutes` is empty;
- `A kind X event must publish to explicit relays (via setRoom or forceRoutes)` when `requiresRelays` is true but `forcedRoutes` is empty.

Subclasses call `super.validate()` and add their own checks — `DeleteWriter` requires at least one `e`/`a` tag, and so on.

Tags are assembled as:

```
[...buildTags(), ...behaviorTags, ...extraTags]
```

where `behaviorTags` are the present ones among `roomTag`, `protectTag`, `expirationTag`, `contentWarningTag`, `clientTag`, `identifierTag`. That ordering is the passthrough in action: kind-specific tags first, then the behavior tags, then the untouched leftovers.

### Output methods

There is no `toTemplate`/`toEvent`/`toRumor` on the writer. Instead it produces an unsigned template, and the caller signs it. All are async and take **no** arguments — the context (signer, resolver) was injected at `configure`:

```typescript
const template = await writer.renderTemplate()   // EventTemplate {kind, content, tags}
const relays   = await writer.relays()           // string[] — where to publish
const {event, relays} = await writer.render()    // both at once
```

`renderTemplate()` is the heart of it: it runs `validate()`, resolves every in-tag `Hint` to a single url via `context.resolver.relay(...)` (falling back to `""`), builds the content (encrypting for list kinds), and returns `{kind, content, tags}`. `render()` calls it and pairs the template with the resolved relay list.

To sign, hand the template to a signer — this is what the app and the test helpers do:

```typescript
import {stamp} from "@welshman/util"

const signed = await signer.sign(stamp(await writer.renderTemplate()))
```

### Routing a writer

A writer computes where the event should be published. The default `renderRoutes()` targets the author's outbox plus every p-tagged pubkey's inbox:

```typescript
protected async renderRoutes(): Promise<RelaySelection[]> {
  return [userOutbox(), ...inboxes(tagValues(hexTags("p"), await this.renderTags()), 0.5)]
}
```

`renderTags()` returns the fully-assembled tags with every `Hint` rendered as `""` — the view used for routing. `scenario()`/`relays()` resolve these routes through the configured `Resolver`.

Kinds override `renderRoutes()` when the default is wrong. For instance `FollowListWriter` and `MuteListWriter` route to `[userOutbox()]` only (their p-tags are data, not recipients), and `DeleteWriter` adds each deleted event's seen relays.

### Forced routes and required relays

Some events must go to specific relays regardless of outbox/inbox routing — NIP-29 room events, relay-management ops, and so on. Two mechanisms cover this:

```typescript
writer.setRoom(url, room)         // forcedRoutes = [relay(url)]  AND  h tag = ["h", room]
writer.forceRoutes(...routes)     // forcedRoutes = routes         (no h tag)
writer.clearRoom()                // clears both
writer.clearForcedRoutes()        // clears forcedRoutes
```

`forceRoutes` takes routes rather than urls, so `forceRoutes(userInbox())` pins an event to the user's read relays without resolving them first.

When `forcedRoutes` is non-empty, `scenario()` publishes **only** to those routes, bypassing `renderRoutes()` entirely.

A kind can also declare it *requires* explicit relays by overriding the readonly field:

```typescript
readonly requiresRelays = true
```

`validate()` then refuses to render until `forcedRoutes` is set (via `setRoom` or `forceRoutes`). The kinds that set this are all NIP-29 room ops/state and all relay-management ops/state — `RoomCreate`, `RoomEdit`, `RoomDelete`, `RoomJoin`, `RoomLeave`, `RoomAddMember`, `RoomRemoveMember`, `RoomMembers`, `RoomAdmins`, `RoomMeta`, `RoomCreatePermission`, `RelayJoin`, `RelayLeave`, `RelayInvite`, `RelayAddMember`, `RelayRemoveMember`, `RelayRole`, and `RelayMembers`. (`RoomCreate` additionally requires a `roomTag`.)

## EventQuery

A `Query` is the read-side counterpart to a `Writer`, a mutable, chainable producer of the `Filter`s that fetch a kind's events and the relays to request them from. Get one with `configuredKind.query()`. The kind comes from the factory, so a query always filters on it.

### Setters

Every field of a filter has a set/add/remove/clear group (or set/clear, for the scalars). All chainable:

```typescript
query
  .setIds(ids)                     // also addIds / removeIds / clearIds
  .setAuthors(pubkeys)             // also addAuthors / removeAuthors / clearAuthors
  .setTag("#e", ids)               // also addTag / removeTag / clearTag / clearTags
  .setSince(timestamp)             // also clearSince; same for setUntil / setLimit / setSearch
```

Tag keys may be written with or without the `#`. A field left alone is unconstrained; one set to an explicitly empty array matches nothing. Adding no values is a no-op, so `addIds([])` leaves the field as it was.

### Routing

`renderRoutes()` is **abstract**, so every kind states where its events live. Two protected helpers cover the common shapes: `authorRoutes()` (the queried authors' outboxes) and `mentionRoutes()` (the inboxes of the pubkeys a `#p` filter names).

```typescript
class NoteQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}
```

Content kinds route to their authors' outboxes plus the inboxes of the pubkeys they tag. Lists and other author-scoped kinds route to their author's outbox alone, since their p-tags are data rather than recipients. Indexed kinds (`Profile`, `FollowList`, `RelayList`, `MessagingRelayList`) add `indexers()`. NIP-29 room and relay-management kinds return `[]`, because they only exist on the relay hosting them, and `DirectMessage` routes to the user's NIP-17 messaging relays.

A query whose kind has nothing to route on resolves to no relays. There is no fallback to the user's own relays; supply the routes yourself when you want one:

```typescript
query.setRoutes(routes)   // replace the rendered routes (e.g. [relay(url)], [userInbox()])
query.addRoutes(routes)   // request these alongside the rendered ones
query.clearRoutes()       // undo both
query.setRoom(url, room)  // #h filter + that one relay (NIP-29) / clearRoom()
```

### Output methods

```typescript
const filters = await query.renderFilters()   // Filter[]
const relays  = await query.relays()          // string[] — where to request them
const {filters, relays} = await query.render()  // both at once
```

### Kind-specific queries

Past `renderRoutes`, most query subclasses are empty. A kind adds methods for relationships it models, backing them with `renderDomainFilters()` — merged onto the base filter, one filter per variant:

```typescript
// Comments anywhere in a thread, or direct replies to one event
const {filters, relays} = await Comment.configure(context).query().forRoot(event).render()
```

`CommentQuery.forRoot(event)` / `.forParent(event)` emit a filter per reference form, since a comment points at its target with either an `E`/`e` id tag or an `A`/`a` address tag. Their `renderRoutes` adds each target author's inbox, where comments p-tagged to that author are delivered.

## ListReader

NIP-51-style lists split their tags into a public set and a private (encrypted) set. `ListReader` extends `AsyncEventReader` — decryption is exactly what makes these kinds' `parse()` a promise — and handles the decryption.

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
const list = await MuteList.configure(context).reader(event).parse()
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

Subclasses build their domain methods on these. For instance `MuteListWriter` exposes `mutePublicly` (public) vs `mutePrivately` (private), and `RoomListWriter` exposes `addRoom`/`removeRoom`/`addRelay`/`removeRelay`.

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

- `domain.reader(factory)` returns an `(event) => Parsed<Reader>` function — it builds *and* parses, so the result is the reader for sync kinds and a promise of it for kinds that decrypt. That is exactly the `EventToItem` shape a collection wants, and it keeps the sync path for kinds that have one.
- `domain.writer(factory, reader?)` returns a fresh writer, optionally seeded for editing.
- `domain.command(writer)` requires the signed-in user, calls `writer.render()`, and wraps the `{event, relays}` in a `Command` you can `.publish()`.

The context `Domain` builds wires in `app.use(Router).resolver`, `app.repository`, and a **lazy** `signer` getter (so auth policies can swap the signer after configuration).

## Old API → new API

| Old (`@welshman/domain`) | New (`@welshman/domain`) |
|---|---|
| `new Kind({reader, builder, router})` | `new KindFactory({reader, writer, router?})` |
| `EventBuilder` / `ListBuilder` / `XBuilder` | `EventWriter` / `ListWriter` / `XWriter` |
| `X.fromEvent(event)` / `Kind.read(event)` / `Kind.factory(signer)` | `factory.configure(ctx).reader(event).parse()` (async only for lists / app data) |
| `Kind.builder(reader?)` / `new XBuilder(reader?)` | `factory.configure(ctx).writer(reader?)` |
| `parse(signer)` | `parse()` (reads `def.context.signer`) |
| `builder.toTemplate(signer?)` | `writer.renderTemplate()` (context injected at `configure`) |
| `builder.toEvent(signer)` | `signer.sign(stamp(await writer.renderTemplate()))` |
| `builder.toRumor(signer)` | `prep(await writer.renderTemplate(), await signer.getPubkey())` |
| `builder.finalize(context)` | `writer.render()` (no arg) |
| `Router.commandFromBuilder(builder)` | `app.use(Domain).command(writer)` |
| `Encryptable` wrapper around an event | `ListWriter.buildContent` (NIP-44, self-encrypted) — no separate wrapper |
