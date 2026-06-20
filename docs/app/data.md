# Data Plugins

These plugins expose reactive collections of nostr data. They all follow the [plugin patterns](./plugins): read synchronously with `get(key)`, reactively with `one(key)` (which lazily loads), and use the convenience accessors that return a [`Projection`](./plugins#projection-t). Resolve each with `app.use(...)`.

Most event-backed plugins load via the **outbox model**: they first resolve the author's NIP-65 write relays (from [`RelayLists`](#relay-lists)), then query those relays. This is why nearly every data plugin depends on relay lists.

## Profiles

Kind-0 profiles keyed by pubkey.

```typescript
const profiles = app.use(Profiles)

profiles.one(pubkey)              // Readable<Maybe<Profile>> — lazily loads
profiles.get(pubkey)             // Maybe<Profile> — sync snapshot, no load
await profiles.load(pubkey)      // explicit load (cached)
profiles.display(pubkey)         // Projection<string> — display name (falls back to npub)
await profiles.publish(values)   // merge a partial values record over the current profile and publish (kind 0)
```

`profiles.display(pubkey).$` is the right thing to bind in a component for a user's name.

## Follows

Kind-3 follow lists keyed by pubkey.

```typescript
const follows = app.use(FollowLists)

follows.one(pubkey)                          // Readable<Maybe<FollowList>>
await follows.follow(["p", otherPubkey])     // add a tag and publish to outbox
await follows.unfollow(otherPubkey)          // remove and publish
```

## Mutes

Kind-10000 mute lists keyed by pubkey. Private entries are NIP-44 encrypted, so decoding is asynchronous.

```typescript
const mutes = app.use(MuteLists)

mutes.one(pubkey)                            // Readable<Maybe<MuteList>>
await mutes.mutePublicly(["p", pubkey])      // public mute
await mutes.mutePrivately(["p", pubkey])     // encrypted mute
await mutes.unmute(pubkey)
await mutes.setMutes({publicTags, privateTags})
```

## Pins

Kind-10001 pin lists keyed by pubkey.

```typescript
const pins = app.use(PinLists)

pins.one(pubkey)
await pins.pin(["e", eventId])
await pins.unpin(eventId)
```

## Relay lists

The NIP-65 relay list (kind 10002) is the routing substrate the whole outbox model depends on.

```typescript
const relayLists = app.use(RelayLists)

relayLists.urls(pubkey)          // Projection<string[]> — all relays
relayLists.readUrls(pubkey)      // Projection<string[]> — read relays
relayLists.writeUrls(pubkey)     // Projection<string[]> — write relays

// Mutations for the current user
await relayLists.addRelay(url, RelayMode.Write)
await relayLists.removeRelay(url, RelayMode.Read)   // also notifies the removed relay
await relayLists.setReadRelays(urls)
await relayLists.setWriteRelays(urls)
await relayLists.setRelays(tags)
```

### Specialized relay lists

Each of these is a separate kind with the same shape (`urls(pubkey)`, `addUrl`, `removeUrl`, `setUrls`):

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

Relay-based group management. Each method builds the relevant room event and publishes it to a single relay as the current user.

```typescript
const rooms = app.use(Rooms)

rooms.create(relayUrl, roomMeta)
rooms.edit(relayUrl, roomMeta)
rooms.delete(relayUrl, roomMeta)
rooms.join(relayUrl, roomMeta)
rooms.leave(relayUrl, roomMeta)
rooms.addMember(relayUrl, roomMeta, pubkey)
rooms.removeMember(relayUrl, roomMeta, pubkey)
```

## Plaintext

A cache of decrypted content, keyed by event id. Only decrypts events authored by the current user (e.g. your own private list entries or DMs).

```typescript
const text = await app.use(Plaintext).ensure(event)   // decrypts & caches
const cached = app.use(Plaintext).get(event.id)        // sync read of the cache
```
