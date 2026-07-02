# Data Plugins

These plugins expose reactive collections of nostr data. They all follow the [plugin patterns](./plugins): read synchronously with `get(key)`, reactively with `one(key)` (which lazily loads), and use the convenience accessors that return a [`Projection`](./plugins#projection-t). Resolve each with `app.use(...)`.

Most event-backed plugins load via the **outbox model**: they first resolve the author's NIP-65 write relays (from [`RelayLists`](#relay-lists)), then query those relays. This is why nearly every data plugin depends on relay lists.

Mutation methods (`create`, `update`, `follow`, `addRelay`, etc.) build the event and return a [`Command`](./publishing#commands) rather than publishing it — call `.publish()` on the result (or `.publishAsRelay(url)`) to actually send it. Since these methods are themselves `async`, the examples below use the `publish`/`publishAsRelay` free functions (`import {publish} from "@welshman/app"`) to chain onto the outer promise instead of double-awaiting.

## Profiles

Kind-0 profiles keyed by pubkey.

```typescript
const profiles = app.use(Profiles)

profiles.one(pubkey)              // Readable<Maybe<Profile>> — lazily loads
profiles.get(pubkey)             // Maybe<Profile> — sync snapshot, no load
await profiles.load(pubkey)      // explicit load (cached)
profiles.display(pubkey)         // Projection<string> — display name (falls back to npub)

// merge a partial values record over the current profile (kind 0) and publish
const command = await profiles.publish(values)
await command.publish()
```

`profiles.display(pubkey).$` is the right thing to bind in a component for a user's name.

## Follows

Kind-3 follow lists keyed by pubkey.

```typescript
const follows = app.use(FollowLists)

follows.one(pubkey)                                    // Readable<Maybe<FollowList>>
await follows.follow(["p", otherPubkey]).then(publish)   // add a tag, then publish to outbox
await follows.unfollow(otherPubkey).then(publish)        // remove, then publish
```

## Mutes

Kind-10000 mute lists keyed by pubkey. Private entries are NIP-44 encrypted, so decoding is asynchronous.

```typescript
const mutes = app.use(MuteLists)

mutes.one(pubkey)                                       // Readable<Maybe<MuteList>>
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
import {Pinboards, Pins, PinBuilder} from "@welshman/app"

const pinboards = app.use(Pinboards)

pinboards.one(address)                          // Readable<Maybe<Pinboard>>
pinboards.forAuthor(pubkey)                      // Projection<Pinboard[]>
await pinboards.loadForAuthor(pubkey)            // fetch all of an author's boards

const command = await pinboards.create({title: "Japan Trip 2024", topics: ["japan", "travel"]})
await command.publish()
await pinboards.update(address, builder => builder.setTitle("Renamed")).then(publish)

const pins = app.use(Pins)

pins.one(address)                                // Readable<Maybe<Pin>>
pins.forBoard(address)                           // Projection<Pin[]> — pins on a board (any author)
pins.forProfile(pubkey)                          // Projection<Pin[]> — an author's profile pins (no board)
await pins.loadForBoard(address)                  // fetch from the board owner's read relays
await pins.loadForProfile(pubkey)                 // fetch from the author's outbox

// Pins.create takes an already-built PinBuilder (unlike Pinboards.create's fields object)
const pinCommand = await pins.create(new PinBuilder().setEvent(eventId).addBoard(address))
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

// Mutations for the current user — each returns a Command; call .publish() to send it
await relayLists.addRelay(url, RelayMode.Write).then(publish)
await relayLists.removeRelay(url, RelayMode.Read).then(publish)   // also notifies the removed relay
await relayLists.setReadRelays(urls).then(publish)
await relayLists.setWriteRelays(urls).then(publish)
await relayLists.setRelays(tags).then(publish)
```

### Specialized relay lists

Each of these is a separate kind with the same shape (`urls(pubkey)`, `addUrl`, `removeUrl`, `setUrls` — the mutators return a [`Command`](./publishing#commands)):

| Plugin | Kind | Purpose |
|---|---|---|
| `BlockedRelayLists` | 10006 | Relays the user refuses to connect to (also gates [auth](./apppolicies) and [relay quality](./routing#relay-quality)) |
| `MessagingRelayLists` | 10050 | NIP-17 DM inbox relays (used by [gift-wrapped publishing](./publishing#gift-wrapped-messages)) |
| `SearchRelayLists` | 10007 | NIP-50 search relays |

```typescript
app.use(BlockedRelayLists).urls(pubkey)      // Projection<string[]>
app.use(MessagingRelayLists).urls(pubkey)
app.use(SearchRelayLists).urls(pubkey)
```

## Relays (NIP-11)

Relay metadata fetched over **HTTP**, keyed by relay URL.

```typescript
const relays = app.use(Relays)

relays.one(url)                              // Readable<Maybe<RelayProfile>> — lazily fetches NIP-11
relays.display(url)                          // Projection<string>
await relays.hasNip(url, 50)                 // boolean — does the relay support a NIP?
await relays.hasNegentropy(url)              // boolean — NIP-77 / negentropy support
```

## Relay management (NIP-86)

```typescript
await app.use(RelayManagement).post(url, managementRequest)
```

Builds a NIP-98 HTTP-auth event signed by the current user and sends a NIP-86 management request to the relay.

`publishToRelay(url, event)` signs `event` as the current user and publishes it directly to `url` via `Thunks`, bypassing outbox routing entirely. It's what backs [`Command.publishAsRelay(url)`](./publishing#commands):

```typescript
await app.use(RelayManagement).publishToRelay(url, event)
```

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

Relay-based group management. Each method builds the relevant room event and returns a [`Command`](./publishing#commands) targeting the given relay.

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

A cache of decrypted content, keyed by event id. Only decrypts events authored by the current user (e.g. your own private list entries or DMs).

```typescript
const text = await app.use(Plaintext).ensure(event)   // decrypts & caches
const cached = app.use(Plaintext).get(event.id)        // sync read of the cache
```
