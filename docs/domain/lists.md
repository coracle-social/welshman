# Lists

NIP-51 lists — follows, mutes, pins, bookmarks, relay lists, and friends — all share one shape: a set of **public** tags and an optional set of **private** tags that are NIP-44-encrypted into the event's content, self-encrypted to the author. Every list kind is a thin subclass of `ListReader` / `ListBuilder`, so once you know the shared pattern you know all of them. The base classes are documented in depth in [Readers & Builders](./readers-and-builders); this page covers the per-kind getters and setters.

## The shared pattern

A `ListReader` exposes its tags as a merged view (`publicTags` + `privateTags`), and every getter reads through that merged view. **Private tags only decrypt when you pass the list author's own signer** to `fromEvent`/`factory`; reading someone else's list, or your own without a signer, yields public tags only.

```typescript
import {MuteList, MuteListBuilder} from "@welshman/domain"

// Read. Pass the author's signer to surface private (encrypted) entries.
const mutes = await MuteList.fromEvent(event, signer)
mutes.pubkeys()          // both public and private mutes, when decrypted
mutes.includes(somePk)   // boolean

// Build. Public vs private goes to different setters; encryption happens
// in buildContent when there are private tags.
const signed = await new MuteListBuilder()
  .mutePublicly(pubkeyA)
  .mutePrivately(pubkeyB)
  .toEvent(signer)       // toEvent/toRumor always pass the signer through
```

Every list builder inherits the base tag mutators from `ListBuilder`:

```typescript
builder
  .addPublic(...tags)    // append to the public set
  .addPrivate(...tags)   // append to the private (encrypted) set
  .keepPublic(pred)      // filter; also keepPrivate, keep (both sets)
  .dropPublic(pred)      // filter out; also dropPrivate, drop (both sets)
  .clearPublic()         // empty; also clearPrivate, clear (both sets)
```

The per-kind methods below (`addFollow`, `mutePrivately`, `bookmarkPublicly`, …) are just named wrappers over these. Anything ending in `*Privately` is `addPrivate`; everything else is `addPublic`; `remove*`/`un*` is a `drop`.

::: tip toTemplate and the signer
Because encryption lives in `ListBuilder.buildContent`, `toTemplate(signer)` only needs a signer when you have actually written private tags. With private mutes/follows you must pass one (`A signer is required to encrypt private tags`); a purely public edit needs none. `toEvent`/`toRumor` always pass the signer through for you.
:::

## The kinds

| Class | Kind | NIP | Reader getters | Builder methods |
|---|---|---|---|---|
| `FollowList` | 3 | NIP-02 | `pubkeys()`, `includes(pk)` | `addFollow(tag)`, `removeFollow(value)` |
| `MuteList` | 10000 | NIP-51 | `pubkeys()`, `includes(pk)` | `mutePublicly(pk)`, `mutePrivately(pk)`, `unmute(pk)` |
| `PinList` | 10001 | NIP-51 | `ids()`, `addresses()` | `pinPublicly(tag)`, `pinPrivately(tag)`, `unpin(value)` |
| `RelayList` | 10002 | NIP-65 | `urls()`, `readUrls()`, `writeUrls()` | `addUrl(url, mode)`, `removeUrl(url, mode)`, `setReadUrls(urls)`, `setWriteUrls(urls)`, `setTags(tags)` |
| `BookmarkList` | 10003 | NIP-51 | `ids()`, `addresses()`, `topics()`, `urls()` | `bookmarkPublicly(tag)`, `bookmarkPrivately(tag)`, `removeBookmark(value)` |
| `GroupList` | 10004 | NIP-51 | `addresses()` | `addGroup(address, relayHint?)`, `removeGroup(address)` |
| `BlockedRelayList` | 10006 | NIP-51 | `urls()`, `includes(url)` | `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |
| `SearchRelayList` | 10007 | NIP-51 | `urls()`, `includes(url)` | `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |
| `RoomList` | 10009 | NIP-51 | `groups()`, `groupTags()` | `join(groupId, url)`, `leave(groupId)` |
| `FeedList` | 10014 | NIP-51 | `addresses()`, `includes(address)` | `addFeed(address, relayHint?)`, `addFeedPrivately(address, relayHint?)`, `removeFeed(address)` |
| `TopicList` | 10015 | NIP-51 | `topics()`, `addresses()`, `includes(topic)` | `followPublicly(topic)`, `followPrivately(topic)`, `follow(topic)`, `unfollow(topic)` |
| `EmojiList` | 10030 | NIP-51 | `emojis()`, `emojiSets()` | `addEmoji(shortcode, url)`, `removeEmoji(value)`, `addEmojiSet(address)`, `removeEmojiSet(value)` |
| `MessagingRelayList` | 10050 | NIP-17 | `urls()` | `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |
| `BlossomServerList` | 10063 | Blossom BUD-03 | `urls()`, `includes(url)` | `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |
| `RelaySet` | 30002 | NIP-51 | `title()`, `description()`, `image()`, `urls()` | `setTitle`, `setDescription`, `setImage`, `addUrl(url)`, `removeUrl(url)`, `setUrls(urls)` |

Each comes with a matching `*Builder` (`FollowListBuilder`, `MuteListBuilder`, …).

## Public vs private (encrypted) tags

A few of these kinds expose a deliberate public/private choice, mapping to the encrypted-content split:

```typescript
import {FollowListBuilder, BookmarkListBuilder, TopicListBuilder} from "@welshman/domain"

// Follows are public-only in practice (addFollow → addPublic)
new FollowListBuilder().addFollow(["p", pubkey])

// Bookmarks, pins, mutes, feeds, and topics offer both:
new BookmarkListBuilder().bookmarkPublicly(["e", noteId])      // visible to everyone
new BookmarkListBuilder().bookmarkPrivately(["e", noteId])     // encrypted, author-only
new TopicListBuilder().followPrivately("nostr")                // encrypted interest
```

The relay-config lists (`RelayList`, `BlockedRelayList`, `SearchRelayList`, `MessagingRelayList`, `BlossomServerList`, `RelaySet`) keep everything in public tags — there is no private variant of `addUrl`.

## Notes per family

**`RelayList` (NIP-65).** Read/write are encoded by the `r`-tag's third element; a bare `["r", url]` counts as both. `urls()` returns all, `readUrls()`/`writeUrls()` filter by `RelayMode`. On the builder, `addUrl(url, mode)`/`removeUrl(url, mode)` preserve the *other* mode if it was present, so flipping write on a read-only relay produces a bare both-mode tag rather than clobbering it. URLs are normalized via `normalizeRelayUrl`.

```typescript
import {RelayListBuilder} from "@welshman/domain"
import {RelayMode} from "@welshman/util"

await new RelayListBuilder()
  .addUrl("wss://relay.example", RelayMode.Write)
  .addUrl("wss://read.example", RelayMode.Read)
  .toEvent(signer)
```

**Relay/server set lists.** `BlockedRelayList`, `SearchRelayList`, and `MessagingRelayList` store URLs under the `relay` tag key; `BlossomServerList` uses the `server` key instead. All four share `addUrl`/`removeUrl`/`setUrls` (where `setUrls` clears then re-adds), with `normalizeRelayUrl` applied.

**`RelaySet` (kind 30002).** A named, addressable relay set — it is parameterized-replaceable, so the builder needs a `d` tag (`setIdentifier()`). Its constructor lifts `title`/`description`/`image` out of the tags into dedicated fields, and `buildTags` prepends them ahead of the `relay` tags.

```typescript
import {RelaySetBuilder} from "@welshman/domain"

await new RelaySetBuilder()
  .setIdentifier()                        // required d tag for kind 30002
  .setTitle("My relays")
  .addUrl("wss://relay.example")
  .toEvent(signer)
```

**`RoomList` (kind 10009).** A simple-groups membership list. `join(groupId, url)` writes `["group", groupId, url]`; `leave(groupId)` drops the matching tag. (NIP-29 room *operations* themselves live in [Rooms](./rooms).)

## See also

- [Readers & Builders](./readers-and-builders) — the `ListReader`/`ListBuilder` base, including exactly how private-tag encryption and decryption work.
- [Rooms](./rooms) — NIP-29 room ops, referenced by `RoomList`.
