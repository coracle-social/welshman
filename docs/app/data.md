# Data Plugins

These plugins expose reactive collections of nostr data. They follow the [plugin patterns](./plugins): `get(key)` reads synchronously, `one(key)` reads reactively and loads lazily, and convenience accessors return a [`Projection`](../store/projection#projection-t).

Most event-backed plugins load over the **outbox model**: they resolve the author's NIP-65 write relays from [`RelayLists`](#relay-lists), then query those relays.

Each event-backed plugin decodes events with `app.use(Domain).reader(Kind)`, so its items are [`@welshman/domain`](../domain/) readers such as `ProfileReader` or `FollowListReader`, with synchronous getters like `author()`, `pubkeys()`, or `urls()`.

Mutation methods (`create`, `update`, `follow`, `mutePublicly`, …) return a [`Command`](./publishing#commands) rather than publishing. The examples below chain the `publish` free function from `@welshman/app` onto them.

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

## Follows

Kind-3 follow lists keyed by pubkey.

```typescript
const follows = app.use(FollowLists)

follows.one(pubkey)                                    // Readable<Maybe<FollowListReader>>
await follows.follow(["p", otherPubkey]).then(publish)   // add a tag
await follows.unfollow(otherPubkey).then(publish)
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

Kind-10001 pin lists keyed by pubkey. The [Pinboards NIP's `Pins`](#pinboards-pinboards-nip) plugin below is a different kind.

```typescript
const pinLists = app.use(PinLists)

pinLists.one(pubkey)
await pinLists.pin(["e", eventId]).then(publish)
await pinLists.unpin(eventId).then(publish)
```

## Pinboards (Pinboards NIP)

`Pinboard` (kind 30067) is board metadata, many per author, keyed by address. `Pin` (kind 39067) is a single pinned item (a nostr event, addressable event, or external id) with zero or more boards it belongs to via `A` tags. A pin with no boards is a profile pin. The kinds are described in [Content](../domain/content#pinboard-kind-30067-and-pin-kind-39067).

```typescript
import {Pinboards, Pins, Domain} from "@welshman/app"

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

// Pins.create takes a PinWriter, where Pinboards.create takes fields
const pinCommand = await pins.create(
  app.use(Domain).writer(Pin).setEvent(eventId).addBoard(address),
)
await pinCommand.publish()

await pins.addToBoard(address, otherBoardAddress).then(publish)
await pins.removeFromBoard(address, otherBoardAddress).then(publish)
```

## Relay lists

The NIP-65 relay list (kind 10002), which the outbox model routes on.

```typescript
const relayLists = app.use(RelayLists)

relayLists.urls(pubkey)          // Projection<string[]> — all relays
relayLists.readUrls(pubkey)      // Projection<string[]> — read relays
relayLists.writeUrls(pubkey)     // Projection<string[]> — write relays

// addReadUrl/addWriteUrl, removeReadUrl/removeWriteUrl and setReadUrls/setWriteUrls
// are shorthands for update(fn)
await relayLists.addWriteUrl(url).then(publish)
await relayLists.removeReadUrl(url).then(publish)   // also sent to the removed relay
await relayLists.update(writer => writer.setTags(tags)).then(publish)
```

### Specialized relay lists

Each of these is a separate kind keyed by pubkey. All expose `urls(pubkey)` (a `Projection<string[]>`), `update(fn)`, and the `addUrl`/`removeUrl`/`setUrls` shorthands, each returning a [`Command`](./publishing#commands).

| Plugin | Kind | Purpose |
|---|---|---|
| `BlockedRelayLists` | 10006 | Relays the user blocks, which [auth](./app#auth-policy-builders) skips and [relay quality](./routing#relay-quality) scores `0` |
| `MessagingRelayLists` | 10050 | NIP-17 DM inbox relays (used by [gift-wrapped publishing](./publishing#gift-wrapped-messages)) |
| `SearchRelayLists` | 10007 | NIP-50 search relays |
| `BlossomServerLists` | 10063 | Blossom media servers |

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

A document's payment fields are read off the [`Relay`](../util/relay) itself: `relay.isPaid()`, `relay.payments_url` and `relay.fees`.

## Relay notifications

The latest `NOTIFY` ([message](../net/message)) per relay url, in memory.

```typescript
const notify = app.use(Notify)

notify.one(url)                              // Readable<Maybe<NotifyItem>>
notify.get(url)                              // Maybe<NotifyItem> — {url, message, receivedAt}
```

A relay sends one to tell the authenticated user something about their account, and replaces it by sending another, so only the most recent message per relay is kept. [`appPolicyNotify`](./app#default-policies) is what fills the store. A relay may resend its latest message after every AUTH, so anything that needs a message to stay dismissed persists that itself.

## Relay management (NIP-86)

```typescript
await app.use(RelayManagement).forUrl(url).allowPubkey(pubkey, reason)
```

`forUrl(url)` returns a NIP-86 [`ManagementApi`](../util/) client whose auth events the current user signs. Its methods (`allowPubkey`, `banPubkey`, `deleteRole`, …) issue management requests.

## Handles (NIP-05)

NIP-05 identifiers verified over HTTP, keyed by `name@domain`. Lookups are batched, and go through `dufflepudUrl` when it is configured.

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

## Zap goals (NIP-75)

How much a kind-9041 goal has raised, read from the receipts in the repository.

```typescript
const progress = app.use(ZapGoals).progress(goalEvent, [url])

progress.get()
// {zaps, amount, target, contributors} — amounts in millisats
```

Each receipt is validated against its recipient's zapper, and receipts that arrived
after the goal's `closed_at` are dropped. The projection updates as receipts land
and as the zappers they're checked against finish loading.

## Topics

Hashtags with usage counts, derived from the repository's tag index.

```typescript
const topics = app.use(Topics)

topics.all                                   // Projection<Topic[]>  ({name, count})
topics.byName                                // Projection<Map<string, Topic>>
```

## Rooms (NIP-29)

Relay-based room management. Each method builds the room event with `setRoom(url, h)` and returns a [`Command`](./publishing#commands) that targets only that relay.

```typescript
const rooms = app.use(Rooms)

await rooms.createRoom(relayUrl, roomMeta).then(publish)
await rooms.editRoom(relayUrl, roomMeta).then(publish)
await rooms.deleteRoom(relayUrl, roomMeta).then(publish)
await rooms.joinRoom(relayUrl, roomMeta).then(publish)
await rooms.leaveRoom(relayUrl, roomMeta).then(publish)
await rooms.addMember(relayUrl, roomMeta, pubkey).then(publish)
await rooms.removeMember(relayUrl, roomMeta, pubkey).then(publish)
await rooms.deleteEvent(relayUrl, roomMeta, eventId).then(publish)
```

## Plaintext

A cache of decrypted content, keyed by the ciphertext. The caller supplies the decryption, so the cache is independent of the signer. Concurrent callers for one ciphertext share a single decrypt, so a signer is prompted once rather than once per caller.

```typescript
const text = await app.use(Plaintext).ensure(ciphertext, () => signer.nip44.decrypt(pubkey, ciphertext))
const cached = app.use(Plaintext).get(ciphertext)      // sync read of the cache
```
