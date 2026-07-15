# Data Plugins

These plugins expose reactive collections of nostr data. They all follow the [plugin patterns](./plugins): read synchronously with `get(key)`, reactively with `one(key)` (which lazily loads), and use the convenience accessors that return a [`Projection`](./plugins#projection-t). Resolve each with `app.use(...)`.

Most event-backed plugins load via the **outbox model**: they first resolve the author's NIP-65 write relays (from [`RelayLists`](#relay-lists)), then query those relays. This is why nearly every data plugin depends on relay lists.

Under the hood, each event-backed plugin decodes raw events into [`@welshman/domain`](../domain/) **reader** objects via `app.use(Domain).reader(Kind)` — the `eventToItem` its collection is configured with. So the items you read back (`profiles.get(pubkey)`, `follows.one(pubkey).$`, …) are `Reader` instances such as `ProfileReader` or `FollowListReader`, with synchronous getter methods like `author()`, `pubkeys()`, or `urls()`.

Mutation methods (`create`, `update`, `follow`, `mutePublicly`, etc.) build a domain **writer** with `app.use(Domain).writer(Kind, existingReader?)`, apply the change, and wrap it with `app.use(Domain).command(writer)`, returning a [`Command`](./publishing#commands) rather than publishing it — call `.publish()` on the result (or `.publishAsRelay(url)`) to actually send it. Since these methods are themselves `async`, the examples below use the `publish`/`publishAsRelay` free functions (`import {publish} from "@welshman/app"`) to chain onto the outer promise instead of double-awaiting.

## Profiles

Kind-0 profiles keyed by pubkey.

```typescript
const profiles = app.use(Profiles)

profiles.one(pubkey)              // Readable<Maybe<ProfileReader>> — lazily loads
profiles.get(pubkey)             // Maybe<ProfileReader> — sync snapshot, no load
await profiles.load(pubkey)      // explicit load (cached)
profiles.display(pubkey)         // Projection<string> — display name (falls back to npub)

// merge a partial values record over the current profile (kind 0) and publish
const command = await profiles.update(writer => writer.update(values))
await command.publish()
```

`profiles.display(pubkey).$` is the right thing to bind in a component for a user's name.

## Follows

Kind-3 follow lists keyed by pubkey.

```typescript
const follows = app.use(FollowLists)

follows.one(pubkey)                                    // Readable<Maybe<FollowListReader>>
await follows.follow(["p", otherPubkey]).then(publish)   // add a tag, then publish to outbox
await follows.unfollow(otherPubkey).then(publish)        // remove, then publish
```

## Mutes

Kind-10000 mute lists keyed by pubkey. Private entries are NIP-44 encrypted, so decoding is asynchronous.

```typescript
const mutes = app.use(MuteLists)

mutes.one(pubkey)                                       // Readable<Maybe<MuteListReader>>
const command = await mutes.mutePublicly(["p", pubkey])  // public mute — builds a Command
await command.publish()
await mutes.mutePrivately(["p", pubkey]).then(publish)   // encrypted mute
await mutes.unmute(pubkey).then(publish)
await mutes.setMutes({publicTags, privateTags}).then(publish)
```

## Pins (NIP-51)

Kind-10001 pin lists keyed by pubkey. Not to be confused with the [Pinboards NIP's `Pins`](#pinboards-pinboards-nip) plugin below, a different, unrelated kind.

```typescript
const pinLists = app.use(PinLists)

pinLists.one(pubkey)
await pinLists.pin(["e", eventId]).then(publish)
await pinLists.unpin(eventId).then(publish)
```

## Pinboards (Pinboards NIP)

`Pinboard` (kind 30067) is board metadata — many per author, keyed by address. `Pin` (kind 39067) is a single pinned item — a nostr event, addressable event, or external id, plus zero or more boards it belongs to via `A` tags (none means it's a profile pin). Each pin has its own unique `d` tag, so multiple pins from the same author don't collide (see [`welshman-domain`](../domain/content#pinboard-kind-30067-and-pin-kind-39067)).

```typescript
import {Pinboards, Pins, Pin, Domain} from "@welshman/app"

const pinboards = app.use(Pinboards)

pinboards.one(address)                          // Readable<Maybe<PinboardReader>>
pinboards.forAuthor(pubkey)                      // Projection<PinboardReader[]>
await pinboards.loadForAuthor(pubkey)            // fetch all of an author's boards

const command = await pinboards.create({title: "Japan Trip 2024", topics: ["japan", "travel"]})
await command.publish()
await pinboards.update(address, writer => writer.setTitle("Renamed")).then(publish)

const pins = app.use(Pins)

pins.one(address)                                // Readable<Maybe<PinReader>>
pins.forBoard(address)                           // Projection<PinReader[]> — pins on a board (any author)
pins.forProfile(pubkey)                          // Projection<PinReader[]> — an author's profile pins (no board)
await pins.loadForBoard(address)                  // fetch from the board owner's read relays
await pins.loadForProfile(pubkey)                 // fetch from the author's outbox

// Pins.create takes an already-built PinWriter (unlike Pinboards.create's fields object)
const pinCommand = await pins.create(
  app.use(Domain).writer(Pin).setEvent(eventId).addBoard(address),
)
await pinCommand.publish()

await pins.addToBoard(address, otherBoardAddress).then(publish)
await pins.removeFromBoard(address, otherBoardAddress).then(publish)
```

## Relay lists

The NIP-65 relay list (kind 10002) is the routing substrate the whole outbox model depends on.

```typescript
const relayLists = app.use(RelayLists)

relayLists.urls(pubkey)          // Projection<string[]> — all relays
relayLists.readUrls(pubkey)      // Projection<string[]> — read relays
relayLists.writeUrls(pubkey)     // Projection<string[]> — write relays

// Mutations for the current user go through update(fn), which builds a
// RelayListWriter, applies fn, and returns a Command — call .publish() to send it.
await relayLists.update(writer => writer.addWriteUrl(url)).then(publish)
await relayLists.update(writer => writer.removeReadUrl(url)).then(publish)   // also notifies the removed relay
await relayLists.update(writer => writer.setReadUrls(urls)).then(publish)
await relayLists.update(writer => writer.setWriteUrls(urls)).then(publish)
await relayLists.update(writer => writer.setTags(tags)).then(publish)
```

### Specialized relay lists

Each of these is a separate kind keyed by pubkey. All expose `urls(pubkey)` (a `Projection<string[]>`) and `update(fn)` (which builds the kind's writer and returns a [`Command`](./publishing#commands)). `MessagingRelayLists` and `SearchRelayLists` additionally expose `addUrl`/`removeUrl`/`setUrls` convenience mutators.

| Plugin | Kind | Purpose |
|---|---|---|
| `BlockedRelayLists` | 10006 | Relays the user refuses to connect to (also gates [auth](./apppolicies) and [relay quality](./routing#relay-quality)) |
| `MessagingRelayLists` | 10050 | NIP-17 DM inbox relays (used by [gift-wrapped publishing](./publishing#gift-wrapped-messages)) |
| `SearchRelayLists` | 10007 | NIP-50 search relays |

```typescript
app.use(BlockedRelayLists).urls(pubkey)      // Projection<string[]>
app.use(MessagingRelayLists).urls(pubkey)
app.use(SearchRelayLists).urls(pubkey)

await app.use(SearchRelayLists).addUrl(url).then(publish)
```

## Relays (NIP-11)

Relay metadata fetched over **HTTP**, keyed by relay URL.

```typescript
const relays = app.use(Relays)

relays.one(url)                              // Readable<Maybe<Relay>> — lazily fetches NIP-11
relays.display(url)                          // Projection<string>
await relays.hasNip(url, 50)                 // boolean — does the relay support a NIP?
await relays.hasNegentropy(url)              // boolean — NIP-77 / negentropy support
```

## Relay management (NIP-86)

```typescript
await app.use(RelayManagement).forUrl(url).allowPubkey(pubkey, reason)
```

`forUrl(url)` returns a NIP-86 [`ManagementApi`](../util/) client whose auth events are signed by the current user. Call its methods (`allowPubkey`, `banPubkey`, `signEvent`, `deleteRole`, …) to issue management requests.

This is also what backs [`Command.publishAsRelay(url)`](./publishing#commands): `signAsRelay(url)` uses `forUrl(url).signEvent(event)` to have the relay sign the event with its own key (NIP-86 `signevent`) before publishing it back to that relay.

## Handles (NIP-05)

NIP-05 identifiers verified over HTTP, keyed by `name@domain`. Lookups are batched (and use `dufflepudUrl` if configured).

```typescript
const handles = app.use(Handles)

handles.forPubkey(pubkey)                    // Projection<Maybe<Handle>> — resolves via the profile's nip05
handles.display(nip05)                       // string — displayable nip05
await handles.loadForPubkey(pubkey)
```

## Zappers (Lightning)

LNURL zapper info keyed by lnurl, fetched over HTTP.

```typescript
const zappers = app.use(Zappers)

zappers.forPubkey(pubkey)                                    // Projection<Maybe<Zapper>>
await zappers.validateZapReceipt(zapReceipt, parentEvent)    // Promise<Maybe<Zap>>
zappers.validZapReceipts(zapReceipts, parentEvent)           // Projection<Zap[]>
```

## Blossom servers

Blossom media-server lists (kind 10063) keyed by pubkey.

```typescript
const list = await app.use(BlossomServerLists).load(pubkey)
app.use(BlossomServerLists).one(pubkey)      // Readable<Maybe<List>>
```

## Topics

Hashtags with usage counts, derived from the repository's tag index.

```typescript
const topics = app.use(Topics)

topics.all                                   // Readable<Topic[]>  ({name, count})
topics.byName                                // Readable<Map<string, Topic>>
```

## Rooms (NIP-29)

Relay-based group management. Each method builds the relevant room event and returns a [`Command`](./publishing#commands) targeting the given relay. Routing is the domain's job: `setGroup(url, id)` records the group's relay and the writer sends the event there (only).

```typescript
const rooms = app.use(Rooms)

await rooms.create(relayUrl, roomMeta).then(publish)
await rooms.edit(relayUrl, roomMeta).then(publish)
await rooms.delete(relayUrl, roomMeta).then(publish)
await rooms.join(relayUrl, roomMeta).then(publish)
await rooms.leave(relayUrl, roomMeta).then(publish)
await rooms.addMember(relayUrl, roomMeta, pubkey).then(publish)
await rooms.removeMember(relayUrl, roomMeta, pubkey).then(publish)
```

## Plaintext

A cache of decrypted content, keyed by the ciphertext. Decryption itself is supplied by the caller (typically the current user's signer), so the cache stays independent of which signer produced the plaintext.

```typescript
const text = await app.use(Plaintext).ensure(ciphertext, () => signer.nip44.decrypt(pubkey, ciphertext))
const cached = app.use(Plaintext).get(ciphertext)      // sync read of the cache
```
