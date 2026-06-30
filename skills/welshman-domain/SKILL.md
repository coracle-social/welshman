---
name: welshman-domain
description: "Use this skill when working with @welshman/domain: reading and building typed nostr events by kind — the Reader/Builder split (EventReader/EventBuilder, ListReader/ListBuilder) that sits between @welshman/util's raw event types and @welshman/app's data plugins. Covers Profile, NIP-51 lists (follows, mutes, pins, relays, bookmarks, topics, emoji, feeds, blossom), NIP-29 rooms, Flotilla relay/space membership, NIP-89 handlers, NIP-57/75 zaps, and content kinds (comment, thread, classified, poll, calendar, report). Use it to parse an event into domain getters, build/edit an event template, handle NIP-44 private-list encryption, or migrate from the old makeProfile/readProfile/makeList/readHandlers/Encryptable/makeRoom*Event helpers."
---

# welshman/domain — Typed Readers & Builders for Nostr Kinds

## Overview

`@welshman/domain` translates nostr events to and from typed domain objects. For each event kind it ships a matched pair:

- a **Reader** — a read-only view over a `TrustedEvent` with synchronous getters (`profile.name()`, `followList.pubkeys()`), and
- a **Builder** — a mutable, chainable producer of an `EventTemplate` (`new ProfileBuilder().setName("alice")`).

It sits one layer above `@welshman/util` (raw `TrustedEvent`/`EventTemplate` types, tag getters, kind constants) and one layer below `@welshman/app` (whose data plugins like `Profiles`/`FollowLists` use these readers as their `eventToItem`). The package is stateless: no stores, no network, no globals — just `event → object` and `object → template`.

This replaces the old free-function helpers that used to live in `@welshman/util` (`makeProfile`/`readProfile`, `makeList`/`readList`, `readHandlers`, `Encryptable`, `makeRoom*Event`). See the migration table below.

## Installation

```bash
npm install @welshman/domain
# or
pnpm add @welshman/domain
```

Peer deps: `@welshman/lib`, `@welshman/util`, `@welshman/signer`, `@welshman/feeds`, and `nostr-tools`.

## Core mental model

1. **Readers wrap an event; Builders produce a template.** A Reader is `new Profile(event)` (validated + parsed via the static factories); a Builder is `new ProfileBuilder()` (or seeded from a reader). Each Reader knows its `builder()`, each Builder optionally takes a `reader`.
2. **Reading is async; getters are sync.** You enter through `await X.fromEvent(event, signer?)` (which runs `parse`), then call plain synchronous getters.
3. **Building is chainable; output is async.** Setters return `this`; you finish with `await b.toTemplate(signer?)` / `toRumor(signer)` / `toEvent(signer)`.
4. **The signer is optional and lazy.** Most kinds ignore it. Only NIP-51 lists need it — to *decrypt* private tags on read, and to *encrypt* them (NIP-44, self-encrypted) on build. Callers can always pass a signer; the kind decides whether it matters.
5. **Round-trips preserve unknown tags.** Build a Builder from a Reader and any tags the class doesn't model are carried through verbatim into the rebuilt template.

## Reading an event

`EventReader` exposes two static entry points. Both validate `event.kind === reader.kind` (throwing `Expected a kind X event, got kind Y`) and run the kind's `parse`.

```typescript
import {Profile, FollowList} from "@welshman/domain"

// One-shot read (the usual entry point):
const profile = await Profile.fromEvent(event)               // no signer needed
const follows = await FollowList.fromEvent(event, signer)    // signer decrypts private tags

// Reusable, class-bound factory over a fixed signer — point-free friendly:
const toProfile = Profile.factory(signer)                    // (event) => Promise<Profile>
const profile2 = await toProfile(someEvent)
```

`factory(signer?)` returns an `async (event) => Promise<Reader>`. It's the shape `@welshman/app` plugins want for their `eventToItem`.

Common base getters available on every reader (all synchronous): `id()`, `author()`, `content()`, `tags()`, `createdAt()`, `identifier()` (d-tag), `address()` (`kind:pubkey:d`), `group()` (NIP-29 h-tag), `protect()` (has `["-"]`), `expiration()`. Each kind adds its own — e.g. `profile.name()`, `profile.display()`, `followList.pubkeys()`, `followList.includes(pk)`.

## Building / editing an event

```typescript
import {ProfileBuilder, FollowListBuilder} from "@welshman/domain"

// Build from scratch:
const template = await new ProfileBuilder()
  .setName("alice")
  .setAbout("hi")
  .toTemplate()                       // EventTemplate {kind, content, tags}

// Edit an existing event (seed the builder from a reader):
const reader = await FollowList.fromEvent(event, signer)
const signed = await reader.builder()      // === new FollowListBuilder(reader)
  .addFollow(["p", pubkey])
  .toEvent(signer)                    // SignedEvent
```

- Construct empty (`new XBuilder()`) or from a reader (`new XBuilder(reader)`, or `reader.builder()`).
- Base behavior setters (chainable): `setContent`, `setGroup`/`clearGroup` (h-tag), `setProtected(bool)`, `setExpiration`/`clearExpiration`, `setIdentifier`/`clearIdentifier` (d-tag, defaults to a random id). Each kind adds its own setters.
- Output methods (all async): `toTemplate(signer?)` → `EventTemplate`; `toRumor(signer)` → `HashedEvent` (needs signer); `toEvent(signer)` → `SignedEvent` (signs + stamps, needs signer).

**Round-trip / extra-tag passthrough.** When a builder is seeded from a reader, every tag in `event.tags` starts in `extraTags`. The base constructor lifts out `h`/`-`/`expiration`/`d`; each subclass lifts the tags it models (via `consumeTags`). Whatever is left is re-emitted unchanged by `toTemplate` (`[...implTags, ...behaviorTags, ...extraTags]`), so unmodeled tags survive an edit.

## Async & signer notes

- **Async surface:** `fromEvent`, the function returned by `factory`, and all of `toTemplate`/`toRumor`/`toEvent` are async. Every getter and every setter is synchronous.
- **Reading private list tags:** a `ListReader` only surfaces `privateTags` when you pass the **author's own** signer to `fromEvent`/`factory` (it decrypts NIP-44 content only when `signer.getPubkey() === event.pubkey`). Decryption failures are swallowed — `decrypted` stays `false` and private tags stay empty.
- **Writing private list tags:** `ListBuilder.buildContent` is where encryption happens. If there are private tags it requires a signer and NIP-44-encrypts them to the author's own pubkey (`A signer is required to encrypt private tags`). If the source was never decrypted, the original ciphertext is preserved untouched (so you don't clobber tags you couldn't see).
- **`toTemplate(signer?)`** needs a signer only for list kinds with non-empty private tags. `toRumor`/`toEvent` always need one. All other kinds ignore the signer entirely.
- **`d`-tag required** (base `validate` throws otherwise) for parameterized-replaceable kinds: `RelaySet` (30002), `Pinboard` (30067), `Classified` (30402), `SlashCommand` (33318, via `setName`), `Feed` (31890), `TimeEvent` (31923), `HandlerRecommendation` (31989), `Handler` (31990), `RoomMeta` (39000), `RoomAdmins` (39001), `RoomMembers` (39002). Call `setIdentifier()`. (`Pin` (39067) sits in the addressable range but is a regular event — its builder skips the d-tag check and instead requires a content reference.)
- **`h`-group required** (subclass `validate` throws): `RoomDelete` (9008), `RoomJoin` (9021), `RoomLeave` (9022). Call `setGroup(groupId)`.

## Kind classes

Each row: kind# — NIP — Reader / Builder.

### Profile

| Kind | NIP | Reader / Builder |
|---|---|---|
| 0 | NIP-01 | `Profile` / `ProfileBuilder` |

`Profile`: `name`, `nip05`, `lnurl`, `about`, `banner`, `picture`, `website`, `display(fallback?)`. Builder: `update`, `setName`, `setNip05`, `setAbout`, `setBanner`, `setPicture`, `setWebsite`. (Also exports `parseLnUrl`, `displayPubkey`.)

### Lists (ListReader/ListBuilder — public/private split, NIP-44 encryption)

| Kind | NIP | Reader / Builder |
|---|---|---|
| 3 | NIP-02 | `FollowList` / `FollowListBuilder` |
| 10000 | NIP-51 | `MuteList` / `MuteListBuilder` |
| 10001 | NIP-51 | `PinList` / `PinListBuilder` |
| 10002 | NIP-65 | `RelayList` / `RelayListBuilder` |
| 10003 | NIP-51 | `BookmarkList` / `BookmarkListBuilder` |
| 10004 | NIP-51 | `GroupList` / `GroupListBuilder` |
| 10006 | NIP-51 | `BlockedRelayList` / `BlockedRelayListBuilder` |
| 10007 | NIP-51 | `SearchRelayList` / `SearchRelayListBuilder` |
| 10009 | NIP-51 | `RoomList` / `RoomListBuilder` |
| 10014 | NIP-51 | `FeedList` / `FeedListBuilder` |
| 10015 | NIP-51 | `TopicList` / `TopicListBuilder` |
| 10030 | NIP-51 | `EmojiList` / `EmojiListBuilder` |
| 10050 | NIP-17 | `MessagingRelayList` / `MessagingRelayListBuilder` |
| 10063 | Blossom BUD-03 | `BlossomServerList` / `BlossomServerListBuilder` |
| 30002 | NIP-51 | `RelaySet` / `RelaySetBuilder` |

List builders share the `ListBuilder` mutators: `addPublic`/`addPrivate`, `keepPublic`/`keepPrivate`/`keep`, `dropPublic`/`dropPrivate`/`drop`, `clearPublic`/`clearPrivate`/`clear`. Each kind also exposes intent-named helpers, e.g. `FollowListBuilder.addFollow`/`removeFollow`, `MuteListBuilder.mutePublicly`/`mutePrivately`/`unmute`, `RelayListBuilder.addUrl(url, mode)`/`setReadUrls`/`setWriteUrls`.

### Rooms (NIP-29)

Room ops are scoped by the `h` group tag (base `setGroup`); metadata kinds 39000–39002 are addressable per room.

| Kind | NIP | Reader / Builder |
|---|---|---|
| 9000 | NIP-29 | `RoomAddMember` / `RoomAddMemberBuilder` |
| 9001 | NIP-29 | `RoomRemoveMember` / `RoomRemoveMemberBuilder` |
| 9002 | NIP-29 | `RoomEdit` / `RoomEditBuilder` |
| 9007 | NIP-29 | `RoomCreate` / `RoomCreateBuilder` |
| 9008 | NIP-29 | `RoomDelete` / `RoomDeleteBuilder` |
| 9021 | NIP-29 | `RoomJoin` / `RoomJoinBuilder` |
| 9022 | NIP-29 | `RoomLeave` / `RoomLeaveBuilder` |
| 19004 | NIP-29 / Flotilla | `RoomCreatePermission` / `RoomCreatePermissionBuilder` |
| 39000 | NIP-29 | `RoomMeta` / `RoomMetaBuilder` |
| 39001 | NIP-29 | `RoomAdmins` / `RoomAdminsBuilder` |
| 39002 | NIP-29 | `RoomMembers` / `RoomMembersBuilder` |

`RoomMeta`: `name`, `about`, `picture`, `pictureMeta`, `isClosed`/`isHidden`/`isPrivate`/`isRestricted`/`hasLivekit`. `RoomEdit` mirrors it but its livekit getter is named `livekit()`. `RoomJoin`: `claim()`, `reason()` (free-text `content`); builder `setClaim`/`setReason`.

### Relay membership (Flotilla "spaces" — relay-level, NIP-29-adjacent)

| Kind | NIP | Reader / Builder |
|---|---|---|
| 8000 | Flotilla | `RelayAddMember` / `RelayAddMemberBuilder` |
| 8001 | Flotilla | `RelayRemoveMember` / `RelayRemoveMemberBuilder` |
| 13534 | Flotilla | `RelayMembers` / `RelayMembersBuilder` |
| 28934 | Flotilla | `RelayJoin` / `RelayJoinBuilder` |
| 28935 | NIP-29 | `RelayInvite` / `RelayInviteBuilder` |
| 28936 | Flotilla | `RelayLeave` / `RelayLeaveBuilder` |

### Handlers (NIP-89)

| Kind | NIP | Reader / Builder |
|---|---|---|
| 31989 | NIP-89 | `HandlerRecommendation` / `HandlerRecommendationBuilder` |
| 31990 | NIP-89 | `Handler` / `HandlerBuilder` |

`Handler`: JSON content → `values: HandlerMeta`; getters `name`, `about`, `picture`, `website`, `lud16`, `nip05`, `kinds()`; builder `setName`/…/`setKinds(number[])`. Exports type `HandlerMeta`.

### Zaps (NIP-57 / NIP-75)

| Kind | NIP | Reader / Builder |
|---|---|---|
| 9041 | NIP-75 | `ZapGoal` / `ZapGoalBuilder` |
| 9734 | NIP-57 | `ZapRequest` / `ZapRequestBuilder` |
| 9735 | NIP-57 | `ZapReceipt` / `ZapReceiptBuilder` |

`ZapRequest`: `amount`, `lnurl`, `recipient`, `eventId`, `urls` (the comment is the base `content()`). `ZapReceipt`: `bolt11`, `invoiceAmount`, `request`, `sender`, `recipient`, `eventId`, `comment`, `preimage`, plus `verify(zapper)`.

### Content

| Kind | NIP | Reader / Builder |
|---|---|---|
| 11 | NIP-7D | `Thread` / `ThreadBuilder` |
| 1018 | NIP-88 | `PollResponse` / `PollResponseBuilder` |
| 1068 | NIP-88 | `Poll` / `PollBuilder` |
| 1111 | NIP-22 | `Comment` / `CommentBuilder` |
| 1984 | NIP-56 | `Report` / `ReportBuilder` |
| 30067 | Pinboards | `Pinboard` / `PinboardBuilder` |
| 30402 | NIP-99 | `Classified` / `ClassifiedBuilder` |
| 31890 | NIP-51 | `Feed` / `FeedBuilder` |
| 31923 | NIP-52 | `TimeEvent` / `TimeEventBuilder` |
| 33318 | slash-commands | `SlashCommand` / `SlashCommandBuilder` |
| 39067 | Pinboards | `Pin` / `PinBuilder` |

`Comment`: `root()`/`parent()`; builder `setRoot`/`setParent`/`setRootFromEvent`/`setParentFromEvent`. `Poll`: `title`, `options`, `pollType`, `endsAt`, `isClosed`, `urls`, plus `results(responses)`; builder `addOption`, `setPollType`, `setEndsAt`. Exported types: `CommentRef`, `ClassifiedPrice`, `PollType`, `PollOption`, `PollResult`, `PinReference`, `SlashCommandParam`, `SlashCommandInvocation`.

`SlashCommand` (33318, addressable; `d` = command name): `name()`, `description()`, `kinds()` (monitored `k`), `groups()` (monitored `h`), `params()` (`SlashCommandParam[]`), `options(label)`, `appliesTo(kind, group?)`. Builder: `setName`/`setDescription`/`setKinds`/`addKind`/`addGroup`/`setGroups`/`addParam(label, type?, optional?)`/`removeParam`/`addOption`/`setOptions`. Plus free functions `parseSlashCommand(content)` / `formatSlashCommand(name, args)` for the `/name <arg> <arg>` invocation string.

`Pinboard` (30067): board metadata — `title`, `description`, `image`, `topics()`, `collaborative()`; builder `setTitle`/`setDescription`/`setImage`/`setTopics`/`setCollaborative`. `Pin` (39067): a single pinned item — `boards()`, `isProfilePin()`, `reference()` (a `PinReference` discriminated union), `title`, `topics()`; builder `addBoard`/`removeBoard`, `setEvent`/`setAddress`/`setExternal` (each replaces the prior reference), `setTitle`/`setTopics`. Pins separate board metadata from items, allowing mixed content, multi-board membership, and profile pins (no board).

## Gotchas

- **Private list tags need the author's signer.** `await FollowList.fromEvent(event)` with no signer (or someone else's) yields only public tags; `decrypted` stays `false`. Pass the author's own signer to see private entries.
- **Don't clobber undecryptable lists.** If you edit a list you couldn't decrypt and try to write private tags, `validate()` throws `Unable to modify list when decryption was not performed`. Editing only public tags is fine — the original ciphertext is preserved.
- **`toRumor`/`toEvent` always need a signer**, even for kinds whose `toTemplate` doesn't (they call `getPubkey()`/`sign`).
- **Parameterized-replaceable kinds throw without a `d` tag** — call `setIdentifier()` (or let it default to a random id). Room ops scoped by `h` throw without `setGroup`.
- **`RoomJoin`/`RelayJoin`/`RelayInvite` read the invite code via `claim()`.**
- **No top-level free functions beyond `parseLnUrl` and `displayPubkey`.** The h/group tag is handled by `setGroup`/`group()`, not a helper. Don't invent `makeX`/`readX` helpers — those were removed (see below).

## Moved from @welshman/util

These helpers used to live in `@welshman/util` and have been replaced by Reader/Builder classes here:

| Old (`@welshman/util`) | New (`@welshman/domain`) |
|---|---|
| `readProfile(event)` | `await Profile.fromEvent(event)` |
| `makeProfile({...})` / editing | `new ProfileBuilder().setName(...)….toTemplate()` |
| `readList(event, signer)` | `await FollowList.fromEvent(event, signer)` (or the kind-specific list reader) |
| `makeList({...})` | `new FollowListBuilder().addFollow(...)….toTemplate(signer)` |
| `readHandlers(event)` | `await Handler.fromEvent(event)` |
| `Encryptable` (manual private-tag encrypt) | `ListBuilder.buildContent` — `addPrivate(...)` then `toTemplate(signer)` (NIP-44, self) |
| `makeRoomMetaEvent` / `makeRoomEditEvent` / `makeRoomJoinEvent` / … | `RoomMetaBuilder` / `RoomEditBuilder` / `RoomJoinBuilder` / … `.toTemplate()` |

The shape of the change: free functions that returned/consumed raw events became classes with sync getters and chainable setters, and private-list encryption moved from an explicit `Encryptable` wrapper into the builder's async `buildContent`.

## Related skills

- `welshman-util` — the raw `TrustedEvent`/`EventTemplate` types, kind constants, and tag getters these classes are built on.
- `welshman-app` — the instance-based app layer whose data plugins (`Profiles`, `FollowLists`, `MuteLists`, …) use these readers as `eventToItem`.
- `welshman-signer` — the `ISigner` interface and NIP-44 `decrypt`/`encrypt` used for private list tags and for `toRumor`/`toEvent`.
