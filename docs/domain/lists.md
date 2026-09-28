# Lists

NIP-51 lists (follows, mutes, pins, bookmarks, relay lists, and others) share one shape: a set of **public** tags and, for the lists that support it, a set of **private** tags that are NIP-44-encrypted into the event's content, self-encrypted to the author. The lists with a private half subclass `ListReader` / `ListWriter`, and their `parse()` has to be awaited because decrypting is IO. The lists that keep everything public subclass `EventReader` / `EventWriter` and parse synchronously. The base classes are documented in [Readers & Writers](./readers-and-writers); this page covers the per-kind getters and setters.

## The shared pattern

A `ListReader`'s getters read a merged view of `publicTags` and `privateTags`. Private tags only decrypt when the context signer belongs to the list's author, so reading someone else's list, or your own without a signer, yields public tags only.

```typescript
import {MuteList} from "@welshman/domain"

// In an app, the signer comes from app.user, so private (encrypted)
// entries surface when you read your own list.
const mutes = await app.use(Domain).reader(MuteList)(event)

// Standalone: bind the signer into the context to decrypt private tags.
const mutes = await MuteList.configure({resolver, signer}).reader(event).parse()

mutes.pubkeys()          // both public and private mutes, when decrypted
mutes.includes(somePk)   // boolean
mutes.words()            // muted `word` tags
mutes.topics()           // muted `t` tags
mutes.ids()              // muted event ids (`e` tags)
mutes.addresses()        // muted addresses (`a` tags)

// Public and private go to different setters; rendering encrypts
// the private tags into the content.
const configured = MuteList.configure({resolver, signer})

const template = await configured.writer()
  .mutePublicly(pubkeyA)
  .mutePrivately(pubkeyB)
  .renderTemplate()
```

Every list writer with a private half inherits the tag mutators from `ListWriter`:

```typescript
writer
  .addPublic(...tags)     // append to the public set
  .addPrivate(...tags)    // append to the private (encrypted) set
  .keepPublic(pred)       // filter; also keepPrivate, keepTags (both sets)
  .dropPublic(pred)       // filter out; also dropPrivate, dropTags (both sets)
```

The per-kind methods below (`mutePrivately`, `bookmarkPublicly`, `pinPrivately`, …) are named wrappers over these.

::: tip renderTemplate and the signer
`renderTemplate()` needs a signer in the context only when the writer holds private tags, and throws `A signer is required to encrypt private tags` otherwise. A purely public edit needs none.
:::

## The kinds

Lists marked **private** subclass `ListReader` / `ListWriter` and expose the public/private split; the rest subclass `EventReader` / `EventWriter`.

| Class | Kind | NIP | Private? | Reader getters | Writer methods |
|---|---|---|---|---|---|
| `FollowList` | 3 | NIP-02 | no | `pubkeys()`, `includes(pk)` | `follow(pk, relayHint?, petname?)`, `unfollow(pk)` |
| `MuteList` | 10000 | NIP-51 | yes | `pubkeys()`, `words()`, `topics()`, `ids()`, `addresses()`, `includes(pk)` | `mutePublicly(pk)`, `mutePrivately(pk)`, `unmute(pk)` |
| `PinList` | 10001 | NIP-51 | yes | `ids()`, `addresses()` | `pinPublicly(tag)`, `pinPrivately(tag)`, `unpin(value)` |
| `RelayList` | 10002 | NIP-65 | no | `urls()`, `readUrls()`, `writeUrls()` | `addReadUrl(url)`, `addWriteUrl(url)`, `removeReadUrl(url)`, `removeWriteUrl(url)`, `setReadUrls(urls)`, `setWriteUrls(urls)`, `setTags(tags)` |
| `BookmarkList` | 10003 | NIP-51 | yes | `ids()`, `addresses()`, `topics()`, `urls()` | `bookmarkPublicly(tag)`, `bookmarkPrivately(tag)`, `removeBookmark(value)` |
| `CommunityList` | 10004 | NIP-51 | no | `addresses()` | `addCommunity(address, relayHint?)`, `removeCommunity(address)` |
| `BlockedRelayList` | 10006 | NIP-51 | no | `urls()`, `includes(url)` | `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |
| `SearchRelayList` | 10007 | NIP-51 | no | `urls()`, `includes(url)` | `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |
| `RoomList` | 10009 | NIP-51 | yes | `rooms()`, `roomTags()`, `relays()`, `urls()`, `roomsForUrl(url)` | `addRoom(roomId, url)`, `removeRoom(roomId, url?)`, `addRelay(url)`, `removeRelay(url)`, `setRelays(urls)`, `migrateRelay(oldUrl, newUrl)` |
| `FeedList` | 10014 | NIP-51 | yes | `addresses()`, `includes(address)` | `addFeed(address, relayHint?)`, `addFeedPrivately(address, relayHint?)`, `removeFeed(address)` |
| `TopicList` | 10015 | NIP-51 | yes | `topics()`, `addresses()`, `includes(topic)` | `followPublicly(topic)`, `followPrivately(topic)`, `follow(topic)`, `unfollow(topic)` |
| `EmojiList` | 10030 | NIP-51 | no | `emojis()`, `emojiSets()` | `addEmoji(shortcode, url)`, `removeEmoji(shortcode)`, `addEmojiSet(address)`, `removeEmojiSet(value)` |
| `MessagingRelayList` | 10050 | NIP-17 | no | `urls()` | `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |
| `BlossomServerList` | 10063 | Blossom BUD-03 | no | `urls()`, `includes(url)` | `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |
| `RelaySet` | 30002 | NIP-51 | no | `title()`, `description()`, `image()`, `urls()` | `setTitle`, `setDescription`, `setImage`, `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |

Each kind exports a reader and writer class (`FollowListReader`/`FollowListWriter`, `MuteListReader`/`MuteListWriter`, …) alongside the `KindFactory` constant (`FollowList`, `MuteList`, …).

## Public vs private (encrypted) tags

The private kinds let the caller choose per entry:

```typescript
import {BookmarkList, TopicList} from "@welshman/domain"

const bookmarks = BookmarkList.configure({resolver, signer})
bookmarks.writer().bookmarkPublicly(["e", noteId])    // visible to everyone
bookmarks.writer().bookmarkPrivately(["e", noteId])   // encrypted, author-only

TopicList.configure({resolver, signer}).writer().followPrivately("nostr")  // encrypted interest
```

`FollowList` and the relay-config lists (`RelayList`, `BlockedRelayList`, `SearchRelayList`, `MessagingRelayList`, `BlossomServerList`, `RelaySet`, `CommunityList`, `EmojiList`) keep everything in public tags.

## Notes per family

**`RelayList` (NIP-65).** The `r` tag's third element encodes read or write, and a bare `["r", url]` counts as both. `urls()` returns all, and `readUrls()`/`writeUrls()` filter by mode. On the writer, `addReadUrl`/`addWriteUrl`/`removeReadUrl`/`removeWriteUrl` preserve the other mode if it was present, so adding write to a read-only relay collapses it to a bare both-mode tag, and removing one mode from a both-mode relay leaves the other. `setReadUrls`/`setWriteUrls` rewrite one mode while preserving the other, and `setTags` replaces the tag list wholesale. URLs are normalized via `normalizeRelayUrl`. The writer publishes to the indexer relays and every relay the list references, both before and after the edit, so each relay learns when it is added to or removed from the list.

```typescript
import {RelayList} from "@welshman/domain"

const template = await RelayList.configure({resolver})
  .writer()
  .addWriteUrl("wss://relay.example")
  .addReadUrl("wss://read.example")
  .renderTemplate()
```

**Relay and server lists.** `BlockedRelayList`, `SearchRelayList`, and `MessagingRelayList` store URLs under the `relay` tag key, and `BlossomServerList` uses the `server` key. All four share `addUrl`/`removeUrl`/`setUrls` (where `setUrls` clears then re-adds), normalizing with `normalizeRelayUrl` (or `normalizeUrl` for Blossom). Tags are matched on their normalized value, so `addUrl` and `removeUrl` find an entry another client wrote in a different spelling.

**`RelaySet` (kind 30002).** A named, addressable relay set. It is parameterized-replaceable, so the writer needs a `d` tag (`setIdentifier()`). Its reader reads `title`/`description`/`image` from the tags, and the writer's `setTitle`/`setDescription`/`setImage` replace the corresponding tag in place.

```typescript
import {RelaySet} from "@welshman/domain"

const template = await RelaySet.configure({resolver})
  .writer()
  .setIdentifier()                        // required d tag for kind 30002
  .setTitle("My relays")
  .addUrl("wss://relay.example")
  .renderTemplate()
```

**`RoomList` (kind 10009).** A NIP-51 simple-groups membership list. `addRoom(roomId, url)` writes `["group", roomId, url]` and adds an `r` tag for the relay if there isn't one; `removeRoom(roomId, url?)` drops the matching room tag. `addRelay`/`removeRelay`/`setRelays` manage the `r` relay tags, `removeRelay` also drops the rooms listed under that relay, and `migrateRelay(oldUrl, newUrl)` points every reference to a relay at its new url, keeping any trailing tag values. The reader's `urls()`/`roomsForUrl(url)` resolve where each room lives. The reader and the writer's room methods treat a legacy `["h", roomId, url]` entry like a `group` entry, and the writer keeps it in the `h` form. The writer publishes to the author's outbox plus every relay the list references, before and after the edit, so each relay learns of membership changes. NIP-29 room operations are covered in [Rooms](./rooms).

## See also

- [Readers & Writers](./readers-and-writers) — the `ListReader`/`ListWriter` base, including how private-tag encryption and decryption work.
- [Rooms](./rooms) — NIP-29 room ops, referenced by `RoomList`.
