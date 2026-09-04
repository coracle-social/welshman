# Lists

NIP-51 lists — follows, mutes, pins, bookmarks, relay lists, and friends — all share one shape: a set of **public** tags and, for the lists that support it, an optional set of **private** tags that are NIP-44-encrypted into the event's content, self-encrypted to the author. The lists with a private half are thin subclasses of `ListReader` / `ListWriter` — the only readers besides `AppData` whose `parse()` you have to await, since decrypting is IO; the relay-config lists that keep everything public subclass the plain `EventReader` / `EventWriter` and parse synchronously. Once you know the shared pattern you know all of them. The base classes are documented in depth in [Readers & Writers](./readers-and-writers); this page covers the per-kind getters and setters.

## The shared pattern

Like every kind in `@welshman/domain`, each list is a `KindFactory` that you `configure` **once** with a `KindContext` (resolver, optional signer, optional repository) to get a `ConfiguredKind`, whose `reader(event)` / `writer(reader?)` build the instances. In an app you get this through the `Domain` plugin; standalone you configure the factory yourself.

A `ListReader` exposes its tags as a merged view (`publicTags` + `privateTags`), and every getter reads through that merged view. **Private tags only decrypt when the context signer is the list author** — `parse()` reads the signer off `this.context.signer` and only decrypts when `signer.getPubkey()` matches the event's author. Reading someone else's list, or your own without a signer in context, yields public tags only.

```typescript
import {MuteList} from "@welshman/domain"

// Read. In an app, the signer comes from app.user, so private (encrypted)
// entries surface automatically when you read your own list.
const mutes = await app.use(Domain).reader(MuteList)(event)

// Standalone: bind the signer into the context to decrypt private tags.
const mutes = await MuteList.configure({resolver, signer}).reader(event).parse()

mutes.pubkeys()          // both public and private mutes, when decrypted
mutes.includes(somePk)   // boolean

// Build. Public vs private goes to different setters; encryption happens
// in buildContent when there are private tags.
const configured = MuteList.configure({resolver, signer})

const template = await configured.writer()
  .mutePublicly(pubkeyA)
  .mutePrivately(pubkeyB)
  .renderTemplate()              // EventTemplate; encrypts privateTags into content
```

Every list writer with a private half inherits the base tag mutators from `ListWriter`:

```typescript
writer
  .addPublic(...tags)     // append to the public set
  .addPrivate(...tags)    // append to the private (encrypted) set
  .keepPublic(pred)       // filter; also keepPrivate, keepTags (both sets)
  .dropPublic(pred)       // filter out; also dropPrivate, dropTags (both sets)
```

The per-kind methods below (`mutePrivately`, `bookmarkPublicly`, `pinPrivately`, …) are just named wrappers over these. Anything ending in `*Privately` is `addPrivate`; everything else is `addPublic`; `remove*`/`un*` is a `dropTags`.

::: tip renderTemplate and the signer
Because encryption lives in `ListWriter.buildContent`, `renderTemplate()` only needs a signer in context when you have actually written private tags. With private mutes/follows you must supply one (`A signer is required to encrypt private tags`); a purely public edit needs none. `renderTemplate()` replaces the old `toTemplate()` and takes no arguments — the signer is whatever was bound at `configure`. Hand the writer to `app.use(Domain).command(writer)` to finalize and publish, or sign the rendered template yourself.
:::

## The kinds

Lists marked **private-capable** subclass `ListReader` / `ListWriter` and expose the public/private split; the rest subclass the plain `EventReader` / `EventWriter`.

| Class | Kind | NIP | Private? | Reader getters | Writer methods |
|---|---|---|---|---|---|
| `FollowList` | 3 | NIP-02 | no | `pubkeys()`, `includes(pk)` | `follow(pk, relayHint?, petname?)`, `unfollow(pk)` |
| `MuteList` | 10000 | NIP-51 | yes | `pubkeys()`, `includes(pk)` | `mutePublicly(pk)`, `mutePrivately(pk)`, `unmute(pk)` |
| `PinList` | 10001 | NIP-51 | yes | `ids()`, `addresses()` | `pinPublicly(tag)`, `pinPrivately(tag)`, `unpin(value)` |
| `RelayList` | 10002 | NIP-65 | no | `urls()`, `readUrls()`, `writeUrls()` | `addReadUrl(url)`, `addWriteUrl(url)`, `removeReadUrl(url)`, `removeWriteUrl(url)`, `setReadUrls(urls)`, `setWriteUrls(urls)`, `setTags(tags)` |
| `BookmarkList` | 10003 | NIP-51 | yes | `ids()`, `addresses()`, `topics()`, `urls()` | `bookmarkPublicly(tag)`, `bookmarkPrivately(tag)`, `removeBookmark(value)` |
| `CommunityList` | 10004 | NIP-51 | no | `addresses()` | `addCommunity(address, relayHint?)`, `removeCommunity(address)` |
| `BlockedRelayList` | 10006 | NIP-51 | no | `urls()`, `includes(url)` | `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |
| `SearchRelayList` | 10007 | NIP-51 | no | `urls()`, `includes(url)` | `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |
| `RoomList` | 10009 | NIP-51 | yes | `rooms()`, `roomTags()`, `relays()`, `urls()`, `roomsForUrl(url)` | `addRoom(roomId, url)`, `removeRoom(roomId, url?)`, `addRelay(url)`, `removeRelay(url)`, `setRelays(urls)` |
| `FeedList` | 10014 | NIP-51 | yes | `addresses()`, `includes(address)` | `addFeed(address, relayHint?)`, `addFeedPrivately(address, relayHint?)`, `removeFeed(address)` |
| `TopicList` | 10015 | NIP-51 | yes | `topics()`, `addresses()`, `includes(topic)` | `followPublicly(topic)`, `followPrivately(topic)`, `follow(topic)`, `unfollow(topic)` |
| `EmojiList` | 10030 | NIP-51 | no | `emojis()`, `emojiSets()` | `addEmoji(shortcode, url)`, `removeEmoji(value)`, `addEmojiSet(address)`, `removeEmojiSet(value)` |
| `MessagingRelayList` | 10050 | NIP-17 | no | `urls()` | `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |
| `BlossomServerList` | 10063 | Blossom BUD-03 | no | `urls()`, `includes(url)` | `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |
| `RelaySet` | 30002 | NIP-51 | no | `title()`, `description()`, `image()`, `urls()` | `setTitle`, `setDescription`, `setImage`, `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |

Each kind exports a matching reader and writer class (`FollowListReader`/`FollowListWriter`, `MuteListReader`/`MuteListWriter`, …), plus the `KindFactory` constant itself (`FollowList`, `MuteList`, …).

## Public vs private (encrypted) tags

The private-capable kinds expose a deliberate public/private choice, mapping to the encrypted-content split:

```typescript
import {BookmarkList, TopicList} from "@welshman/domain"

const bookmarks = BookmarkList.configure({resolver, signer})
bookmarks.writer().bookmarkPublicly(["e", noteId])    // visible to everyone
bookmarks.writer().bookmarkPrivately(["e", noteId])   // encrypted, author-only

TopicList.configure({resolver, signer}).writer().followPrivately("nostr")  // encrypted interest
```

`FollowList` is public-only (`follow` appends a `p` tag to the public set), and the relay-config lists (`RelayList`, `BlockedRelayList`, `SearchRelayList`, `MessagingRelayList`, `BlossomServerList`, `RelaySet`, `CommunityList`, `EmojiList`) keep everything in public tags — there is no private variant of their setters.

## Notes per family

**`RelayList` (NIP-65).** Read/write are encoded by the `r`-tag's third element; a bare `["r", url]` counts as both. `urls()` returns all, `readUrls()`/`writeUrls()` filter by mode. On the writer, `addReadUrl`/`addWriteUrl`/`removeReadUrl`/`removeWriteUrl` preserve the *other* mode if it was present, so adding write to a read-only relay collapses it to a bare both-mode tag rather than clobbering it; removing one mode from a both-mode relay leaves the other. `setReadUrls`/`setWriteUrls` rewrite one axis while preserving the other, and `setTags` replaces the tag list wholesale. URLs are normalized via `normalizeRelayUrl`. Its `renderRoutes()` publishes to the author's outbox, the indexer relays, and every relay the list references now or used to (via the seed reader), so each relay learns when it is added to or removed from the list.

```typescript
import {RelayList} from "@welshman/domain"

const template = await RelayList.configure({resolver})
  .writer()
  .addWriteUrl("wss://relay.example")
  .addReadUrl("wss://read.example")
  .renderTemplate()
```

**Relay/server set lists.** `BlockedRelayList`, `SearchRelayList`, and `MessagingRelayList` store URLs under the `relay` tag key; `BlossomServerList` uses the `server` key instead. All four share `addUrl`/`removeUrl`/`setUrls` (where `setUrls` clears then re-adds), with `normalizeRelayUrl` (or `normalizeUrl` for Blossom) applied. Tags are matched on their normalized value, so `addUrl` and `removeUrl` find an entry another client wrote in a different spelling.

**`RelaySet` (kind 30002).** A named, addressable relay set — it is parameterized-replaceable, so the writer needs a `d` tag (`setIdentifier()`). Its reader lifts `title`/`description`/`image` out of the tags, and the writer's `setTitle`/`setDescription`/`setImage` replace the corresponding tag in place.

```typescript
import {RelaySet} from "@welshman/domain"

const template = await RelaySet.configure({resolver})
  .writer()
  .setIdentifier()                        // required d tag for kind 30002
  .setTitle("My relays")
  .addUrl("wss://relay.example")
  .renderTemplate()
```

**`RoomList` (kind 10009).** A NIP-51 simple-groups membership list, and itself a `ListWriter`. `addRoom(roomId, url)` writes `["group", roomId, url]` and ensures the relay is tracked via an `r` tag; `removeRoom(roomId, url?)` drops the matching group tag. `addRelay`/`removeRelay`/`setRelays` manage the bare `r` relay tags, and the reader's `urls()`/`roomsForUrl(url)` help resolve where each room lives. Like `RelayList`, its `renderRoutes()` publishes to the author's outbox plus every relay the list references now or used to, so each relay learns of membership changes. (NIP-29 room *operations* themselves live in [Rooms](./rooms).)

## See also

- [Readers & Writers](./readers-and-writers) — the `ListReader`/`ListWriter` base, including exactly how private-tag encryption and decryption work, plus the `KindFactory` / `configure` / `ConfiguredKind` entry model.
- [Rooms](./rooms) — NIP-29 room ops, referenced by `RoomList`.
