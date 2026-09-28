# Readers & Writers

Every kind in `@welshman/domain` subclasses a few base classes:

- `EventReader` — a read-only view over one event.
- `AsyncEventReader` — the same, for kinds whose `parse()` has to await something.
- `EventWriter` — a mutable producer of an event template.
- `EventQuery` — a mutable producer of the filters that fetch the kind's events.
- `ListReader` / `ListWriter` — a reader and writer with a public/private tag split, where the private tags are NIP-44-encrypted into the content.

The per-kind files (`Profile`, `FollowList`, `ZapReceipt`, …) add getters and setters on top of these.

## Configuring a kind

Readers, writers and queries take their dependencies from a `KindContext`. The `Resolver` turns relay routes into urls, and the optional `ISigner` decrypts and encrypts private list tags:

```typescript
export type KindContext = {
  resolver: Resolver          // from @welshman/util
  signer?: ISigner            // from @welshman/signer
}
```

Each exported kind is a `KindFactory`, which bundles a kind number with its reader, writer, and query classes:

```typescript
export const Profile = new KindFactory({
  kind: PROFILE,
  reader: ProfileReader,
  writer: ProfileWriter,
  query: ProfileQuery,
})
```

`configure(context)` binds the dependencies and returns a `ConfiguredKind`, which builds readers, writers, and queries:

```typescript
import {Profile} from "@welshman/domain"

const profile = Profile.configure(context)   // ConfiguredKind

const reader = profile.reader(event).parse()  // reader, parsed
const writer = profile.writer()               // fresh writer
const writer2 = profile.writer(reader)        // writer seeded from a reader (edit)
const query = profile.query()                 // fresh query
```

`reader`, `writer`, and `query` are instance arrow-function properties, so they are safe to destructure or pass point-free.

In `@welshman/app` the `Domain` plugin calls `configure` for you. See [With `@welshman/app`](#with-welshmanapp-domain--command) below.

## EventReader

A reader wraps a single `TrustedEvent` and answers questions about it.

### Construction and parse

`ConfiguredKind.reader(event)` validates the event's kind, throwing `Expected a kind X event, got kind Y` on a mismatch, and constructs the reader unparsed. `parse()` populates it and returns the reader:

```typescript
import {Profile, MuteList} from "@welshman/domain"

// Most kinds parse without IO, so there is nothing to await
const profile = Profile.configure(context).reader(event).parse()

// Kinds that decrypt return a promise, and the type makes you await it
const mutes = await MuteList.configure(context).reader(event).parse()
```

The base class a reader extends decides whether `parse()` is async:

```typescript
abstract class EventReader extends BaseEventReader {
  parse(): this           // no IO — Profile, Note, RelayList, …
}

abstract class AsyncEventReader extends BaseEventReader {
  abstract parse(): Promise<this>  // decrypts — the ListReader kinds, AppData
}
```

Only the six private-tag lists (`ListReader` subclasses) and `AppDataReader` are async. Code that doesn't know the kind can write `await kind.reader(event).parse()`, since awaiting a non-promise is a no-op, and the exported `Parsed<R>` type names whichever result a given reader yields.

`parse` takes no arguments. A subclass that needs the signer reads it from `this.context.signer`. Subclasses override `parse` to decode what they need and return `this`:

- `ProfileReader.parse` JSON-parses `event.content` into a `values` object.
- `ZapReceiptReader.parse` decodes the embedded zap-request JSON out of the `description` tag.
- `ListReader.parse` decrypts the private tags (see below).

The getters are synchronous either way.

### Getters

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
| `emojis()` | the NIP-30 `emoji` tags as an `Emoji[]` |
| `imeta()` | the NIP-92 `imeta` tags as an `Imeta[]` |
| `quotes()` | the NIP-18 `q` tags as a `Quote[]` (`{value, relay?, pubkey?}`), in the order they appear |
| `zapSplits()` | the NIP-57 `zap` tags as a `ZapSplit[]` |

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
getContentWarning(event)  // {reason?: string} | undefined
getClient(event)          // Client | undefined
```

`getEmojis`, `getImeta`, `getQuotes` and `getZapSplits` back `emojis()`, `imeta()`, `quotes()` and `zapSplits()` the same way.

Each subclass adds its own getters, such as `profile.name()`, `followList.pubkeys()` and `zapGoal.amount()`. Readers compute no routes. Where to publish an event is the writer's concern, and where to fetch a kind's events is the query's.

## EventWriter

A writer is a mutable, chainable producer of an `EventTemplate`. `configuredKind.writer()` returns an empty one for a new event, and `configuredKind.writer(reader)` returns one seeded from a reader to edit an existing event. Every setter returns `this`.

### Construction and extra-tag passthrough

```typescript
constructor(readonly kind: number, readonly context: KindContext, readonly reader?: Reader)
```

When given a reader, the writer seeds `content` from `reader.event.content` and splits the tags it manages (`h`, `-`, `expiration`, `content-warning`, `client`, and `d`) into dedicated fields (`roomTag`, `protectTag`, `expirationTag`, `contentWarningTag`, `clientTag`, `identifierTag`). The rest go into `extraTags`.

Whatever remains in `extraTags` is passed through verbatim when the event is rebuilt, so tags the package does not model survive an edit. Subclasses lift the tags they understand out of the passthrough set in their own constructors, using the exported `TagParser`. `ListWriter`, for example, takes over everything left as `publicTags`.

### Setters

The base behavior setters, all chainable:

```typescript
someKind.writer()
  .setContent("…")
  .setRoom(relayUrl, roomId)     // h tag + forcedRoutes / clearRoom()
  .setProtected(true)            // ["-"] tag
  .setExpiration(timestamp)      //         / clearExpiration()
  .setContentWarning("nudity")   // NIP-36 tag, reason optional / clearContentWarning()
  .setClient("Coracle")          // NIP-89 tag, handler address optional / clearClient()
  .setIdentifier()               // d tag (defaults to a random id) / clearIdentifier()
```

`setIdentifier(identifier = randomId())` defaults to a freshly generated id, for new parameterized-replaceable events. Each subclass adds its own setters (`setName`, `follow`, `setAmount`, …).

Free-form tags can be added and filtered directly:

```typescript
writer
  .addTags(["t", "nostr"])         // append to extraTags
  .keepTags(tag => tag[0] !== "t") // keep matching
  .dropTags(tag => tag[0] === "t") // drop matching
```

A behavior tag a kind can carry any number of times gets add/remove helpers instead of a setter:

```typescript
writer
  .addEmoji(shortcode, url, address?)                     // ["emoji", …] / removeEmoji(shortcode)
  .addImeta({url, mimeType, alt, …})                      // NIP-92 ["imeta", …] / removeImeta(url)
```

`addImeta` replaces whatever is already attached at that url rather than listing it twice, and `writer.imeta()` reads back what the writer is carrying. `parseImeta` and `renderImeta` are exported for working with a single tag. `parseQuote` and `renderQuote` do the same for a `q` tag, and `writer.quotes()` reads back the ones a writer is carrying. A quote's `value` is the quoted event's id, or its address when the event is replaceable, the way `getIdOrAddress` picks between them.

### Relay hints

Several helpers emit tags with a relay hint, which the protected `hint(...routes)` method resolves to a single url through `context.resolver.relay(...)`, falling back to `""`:

```typescript
writer.addMention(pubkey)               // ["p", pubkey, <hint>]
writer.addQuote(event)                  // ["q", idOrAddress, <hint>, pubkey] / removeQuote(value)
writer.addZapSplit(pubkey, split = 1)   // ["zap", pubkey, <hint>, String(split)] / removeZapSplit(pubkey)
writer.setClient(name, address?)        // ["client", name, address, <hint>]
```

Each hint resolves in the background and is written into its tag's slot. `renderTags()` waits for every pending hint before it returns.

### The build pipeline

Subclasses customize the output by overriding two hooks and `validate`:

```typescript
protected renderDomainTags(): MaybeAsync<string[][]>   // default: [] — kind-specific tags
renderContent(): MaybeAsync<string>                    // default: this.content
validate(): void
```

The base `validate` throws:

- `A d tag is required for kind X` for parameterized-replaceable kinds with no identifier;
- `A room event requires a relay url (set the room via setRoom)` when a `roomTag` is set but `forcedRoutes` is empty;
- `A kind X event must publish to explicit relays (via setRoom or forceRoutes)` when `requiresRelays` is true but `forcedRoutes` is empty.

Subclasses call `super.validate()` and add their own checks. `DeleteWriter`, for example, requires at least one `e`/`a` tag.

`renderTags()` assembles the tags as:

```
[...behaviorTags, ...domainTags, ...extraTags]
```

where `behaviorTags` are the present ones among `roomTag`, `protectTag`, `expirationTag`, `contentWarningTag`, `clientTag`, `identifierTag`.

### Output methods

The writer produces an unsigned template, and the caller signs it. The output methods are async and take no arguments, since the context was bound at `configure`:

```typescript
const template = await writer.renderTemplate()   // EventTemplate {kind, content, tags}
const relays   = await writer.relays()           // string[] — where to publish
const {event, relays} = await writer.render()    // both at once
```

`renderTemplate()` runs `validate()`, renders the tags and the content (encrypting for list kinds), and returns `{kind, content, tags}`. `render()` pairs the template with the resolved relay list.

To sign, hand the template to a signer:

```typescript
import {stamp} from "@welshman/util"

const signed = await signer.sign(stamp(await writer.renderTemplate()))
```

### Routing a writer

The default `renderRoutes()` targets the author's outbox plus every p-tagged pubkey's inbox:

```typescript
protected async renderRoutes(): Promise<RelaySelection[]> {
  return [userOutbox(), ...inboxes(tagValues(hexTags("p"), await this.renderTags()), 0.5)]
}
```

`scenario()` resolves these routes through the configured `Resolver` into a `RelayScenario`, and `relays()` returns its urls.

Kinds override `renderRoutes()` when the default is wrong. `FollowListWriter` and `MuteListWriter` route to `[userOutbox()]` only, because their p-tags are data rather than recipients, and `DeleteWriter` adds each deleted event's seen relays.

### Forced routes and required relays

Some events must go to specific relays regardless of outbox/inbox routing, such as NIP-29 room events and relay-management ops. Two mechanisms cover this:

```typescript
writer.setRoom(url, room)         // forcedRoutes = [relay(url)]  AND  h tag = ["h", room]
writer.forceRoutes(...routes)     // forcedRoutes = routes         (no h tag)
writer.clearRoom()                // clears both
writer.clearForcedRoutes()        // clears forcedRoutes
```

`forceRoutes` takes routes rather than urls, so `forceRoutes(userInbox())` pins an event to the user's read relays without resolving them first. When `forcedRoutes` is non-empty, `scenario()` publishes only to those routes, bypassing `renderRoutes()`.

A kind can also declare that it requires explicit relays by overriding the readonly field:

```typescript
readonly requiresRelays = true
```

`validate()` then refuses to render until `forcedRoutes` is set. The kinds that set this are all NIP-29 room ops and state, all relay-management ops and state, and the NIP-C7 chat kind: `RoomCreate`, `RoomEdit`, `RoomDelete`, `RoomDeleteEvent`, `RoomJoin`, `RoomLeave`, `RoomAddMember`, `RoomRemoveMember`, `RoomMembers`, `RoomAdmins`, `RoomMeta`, `RoomPins`, `RoomUpdatePins`, `RoomCreatePermission`, `RelayJoin`, `RelayLeave`, `RelayInvite`, `RelayAddMember`, `RelayRemoveMember`, `RelayRole`, `RelayMembers`, and `Message`.

## EventQuery

A query is a mutable, chainable producer of the `Filter`s that fetch a kind's events and the relays to request them from. Get one with `configuredKind.query()`. The kind comes from the factory, so a query always filters on it.

### Setters

Every field of a filter has a set/add/remove/clear group, or set/clear for the scalars. All chainable:

```typescript
query
  .setIds(ids)                     // also addIds / removeIds / clearIds
  .setAuthors(pubkeys)             // also addAuthors / removeAuthors / clearAuthors
  .setTag("#e", ids)               // also addTag / removeTag / clearTag / clearTags
  .setSince(timestamp)             // also clearSince; same for setUntil / setLimit / setSearch
```

Tag keys may be written with or without the `#`. A field left alone is unconstrained, and one set to an explicitly empty array matches nothing. Adding no values is a no-op, so `addIds([])` leaves the field as it was.

### Routing

`renderRoutes()` is abstract, so every kind states where its events live. Two protected helpers cover the common shapes: `authorRoutes()` (the queried authors' outboxes) and `mentionRoutes()` (the inboxes of the pubkeys a `#p` filter names).

```typescript
class NoteQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}
```

Content kinds route to their authors' outboxes plus the inboxes of the pubkeys they tag. Lists and other author-scoped kinds route to their author's outbox alone. Indexed kinds (`Profile`, `FollowList`, `RelayList`, `MessagingRelayList`) add `indexers()`. NIP-29 room, relay-management, and chat kinds return `[]`, because they only exist on the relay hosting them, and `DirectMessage` routes to the user's NIP-17 messaging relays.

A query with nothing to route on resolves to no relays. There is no fallback to the user's own relays, so supply the routes yourself when you want one:

```typescript
query.setRoutes(routes)   // replace the rendered routes (e.g. [relay(url)], [userInbox()])
query.addRoutes(routes)   // request these alongside the rendered ones
query.clearRoutes()       // undo both
query.setRoom(url, room)  // #h filter + that one relay (NIP-29) / clearRoom()
```

### Output methods

```typescript
const filters = await query.renderFilters()     // Filter[]
const relays  = await query.relays()            // string[] — where to request them
const {filters, relays} = await query.render()  // both at once
```

### Kind-specific queries

Past `renderRoutes`, most query subclasses are empty. A kind adds methods for relationships it models, backing them with `renderDomainFilters()`, whose filters are each merged onto the base filter:

```typescript
// Comments anywhere in a thread, or direct replies to one event
const {filters, relays} = await Comment.configure(context).query().forRoot(event).render()
```

`CommentQuery.forRoot(event)` / `.forParent(event)` emit a filter per reference form, since a comment points at its target with either an `E`/`e` id tag or an `A`/`a` address tag, and a relay ANDs a filter's fields. Their `renderRoutes` adds each target author's inbox, where comments p-tagged to that author are delivered.

## ListReader

NIP-51-style lists split their tags into a public set and a private (encrypted) set. `ListReader` extends `AsyncEventReader`, because decryption is IO.

```typescript
decrypted = false
publicTags: string[][] = []
privateTags: string[][] = []
```

Its `parse` override:

1. Sets `publicTags = event.tags`.
2. If `event.content` is empty, there is nothing to decrypt, so `decrypted = true`.
3. Otherwise, if the context has a signer belonging to the event's author (`signer.getPubkey() === event.pubkey`), it decrypts the content, marks `decrypted = true`, parses the JSON array, and keeps the well-formed string-tuple tags as `privateTags`. A decryption failure is swallowed and `decrypted` stays `false`.

Private tags therefore only appear when the configured signer is the list author's. Reading someone else's list, or your own list without a signer, gives you the public tags only.

```typescript
// context.signer must be the list author's for private tags to decrypt
const list = await MuteList.configure(context).reader(event).parse()
list.pubkeys()    // includes both public and private mutes, when decrypted
```

`tags()` returns `[...publicTags, ...privateTags]`, so every inherited getter that reads `this.tags()` sees the merged view.

## ListWriter

`ListWriter` extends `EventWriter` with the same public/private split and a chainable set of tag mutators. Its constructor takes over the leftover `extraTags` as `publicTags` and copies `privateTags` from the reader.

### Tag mutators

All chainable:

```typescript
writer
  .addPublic(...tags)        // append to public set
  .addPrivate(...tags)       // append to private (encrypted) set
  .keepPublic(pred)          // filter public to matches; also keepPrivate, keepTags (both)
  .dropPublic(pred)          // filter out matches; also dropPrivate, dropTags (both)
```

Subclasses build their domain methods on these. `MuteListWriter` exposes `mutePublicly` and `mutePrivately`, and `RoomListWriter` exposes `addRoom`/`removeRoom`/`addRelay`/`removeRelay`.

### validate

`ListWriter.validate` throws `Unable to modify list when decryption was not performed` when the source event had encrypted content that was never decrypted and the writer holds private tags. This guards against clobbering private data the writer could not read.

### renderContent: where encryption lives

The list writer encrypts its private tags in `renderContent`:

```typescript
async renderContent(): Promise<string> {
  // Preserve the original ciphertext when we never decrypted it.
  if (this.reader?.decrypted === false) return this.reader.event.content

  // No need to encrypt an empty array.
  if (this.privateTags.length === 0) return ""

  const {signer} = this.context

  if (!signer) {
    throw new Error("A signer is required to encrypt private tags")
  }

  const pubkey = await signer.getPubkey()

  return signer.nip44.encrypt(pubkey, JSON.stringify(this.privateTags))
}
```

There are three branches:

1. **Never decrypted.** It returns the original ciphertext untouched, so you can edit the public tags of a list you could not decrypt without destroying its private contents.
2. **No private tags.** It returns `""`.
3. **Has private tags.** It requires a signer, then NIP-44-encrypts the tags to the author's own pubkey.

`renderDomainTags` returns `publicTags`. The signer comes from `context.signer`, bound at `configure`:

```typescript
import {MuteList} from "@welshman/domain"

// context.signer is the author's; render() encrypts the private tag
const template = await MuteList.configure(context)
  .writer()
  .mutePrivately(targetPubkey)
  .render()
```

## With `@welshman/app`: Domain & Command

The `Domain` plugin owns the `KindContext`, so app code never calls `configure`:

```typescript
const domain = app.use(Domain)

// Read side — pass as a data plugin's eventToItem decoder:
eventToItem: domain.reader(Note)

// Write side:
const writer = domain.writer(FollowList, existingReader).follow(pubkey)
const command = await domain.command(writer)   // requires a signed-in user
command.publish()
```

- `domain.reader(factory)` returns an `(event) => Parsed<Reader>` function that builds and parses, so the result is the reader for sync kinds and a promise of it for kinds that decrypt.
- `domain.writer(factory, reader?)` returns a fresh writer, optionally seeded for editing, and `domain.query(factory)` returns a fresh query.
- `domain.command(writer)` requires the signed-in user, calls `writer.render()`, and wraps the `{event, relays}` in a `Command` you can `.publish()`.

The context wires in `app.use(Router).resolver` and a lazy `signer` getter, so auth policies can swap the signer after configuration. See [the `Domain` plugin](../app/plugins#the-domain-plugin).
