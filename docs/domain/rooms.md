# Rooms

NIP-29 rooms are hosted by a relay. The spec calls them groups, but this package's readers, writers and plugins call them rooms, and only the wire-level `h` and `group` tag names keep the spec's word. `@welshman/domain` models the room metadata kinds and the moderation and membership operations. There are two kinds of event:

- **Addressable metadata** (kinds 39000–39002) is parameterized-replaceable, identified by a `d` tag, and written by the relay. It is the canonical state of a room.
- **Action ops** (kinds 9000–9022, 19004) are regular events scoped to a target room by the NIP-29 **`h` tag**, which the base `setRoom` / `clearRoom` set and `room()` reads.

All of these are plain `EventReader` / `EventWriter` subclasses; see [Readers & Writers](./readers-and-writers) for the base pattern. The `app.use(Rooms)` plugin in `@welshman/app` builds on them.

Every kind here sets `requiresRelays = true`, so a writer's `validate()` throws unless the host relay has been set with `setRoom(url, room)` (or `forceRoutes(relay(url))`). The event then publishes only there; see [Publishing to the room relay](#publishing-to-the-room-relay).

## Room metadata

`RoomMeta` (kind 39000) is the addressable metadata record. It is parameterized-replaceable, so the writer needs a `d` tag (`setIdentifier()`).

```typescript
import {Domain} from "@welshman/app"
import {RoomMeta} from "@welshman/domain"

const meta = app.use(Domain).reader(RoomMeta)(event)
meta.name()           // string | undefined
meta.about()          // string | undefined
meta.picture()        // tag[1]
meta.pictureMeta()    // tag.slice(2) — imeta-style extras, or undefined
meta.isClosed()       // boolean (presence of a ["closed"] tag)
meta.isHidden()       // boolean
meta.isPrivate()      // boolean
meta.isRestricted()   // boolean
meta.hasLivekit()     // boolean

const writer = app.use(Domain).writer(RoomMeta)
  .setRoom(relayUrl, "my-room")   // required: host relay + h tag
  .setIdentifier("my-room")
  .setName("General")
  .setAbout("anything goes")
  .setPicture("https://example.com/room.png")
  .setClosed()                     // ["closed"]; pass false to clear

const template = await writer.renderTemplate()
```

The flag setters (`setClosed`, `setHidden`, `setPrivate`, `setRestricted`, `setLivekit`) each take an optional boolean (default `true`), and passing `false` clears the tag. `setPicture(picture, meta = [])` appends the extra imeta elements.

`RoomEdit` (kind 9002) carries the same metadata fields as an action event scoped by the `h` tag rather than a `d` identifier. It is how a client requests a metadata change. Its reader and writer mirror `RoomMeta`, except that the livekit getter is `livekit()` rather than `hasLivekit()`.

```typescript
import {Domain} from "@welshman/app"
import {RoomEdit} from "@welshman/domain"

const writer = app.use(Domain).writer(RoomEdit)
  .setRoom(relayUrl, roomId)   // host relay + h tag — which room to edit
  .setName("Renamed")

await app.use(Domain).command(writer).then(cmd => cmd.publish())
```

## Admins and members (addressable)

`RoomAdmins` (39001) and `RoomMembers` (39002) are addressable p-tag lists. Each admin tag also carries the admin's NIP-29 roles, `["p", pubkey, ...roles]`.

```typescript
import {Domain} from "@welshman/app"
import {RoomAdmins, RoomMembers} from "@welshman/domain"

const admins = app.use(Domain).reader(RoomAdmins)(event)
admins.pubkeys()                 // string[]
admins.rolesFor(pubkey)          // string[]
admins.rolesByPubkey()           // Map<pubkey, roles>

const members = app.use(Domain).reader(RoomMembers)(event)
members.members()                // string[]
members.isMember(pubkey)         // boolean

const writer = app.use(Domain).writer(RoomMembers)
  .setRoom(relayUrl, roomId)
  .setIdentifier(roomId)
  .addPubkey(pubkeyA)            // also removePubkey(pk) / setPubkeys(pks)
```

`RoomAdminsWriter` and `RoomMembersWriter` both expose `addPubkey(pk)` / `removePubkey(pk)` / `setPubkeys(pks)`, deduping by pubkey. `RoomAdminsWriter.addPubkey(pk, roles?)` replaces an admin's roles when given and keeps the existing ones otherwise, and `setPubkeys` keeps the roles of every admin it retains.

## Membership and lifecycle ops

These are scoped to a room by the `h` tag.

| Class | Kind | Purpose | Reader | Writer |
|---|---|---|---|---|
| `RoomCreate` | 9007 | create a room | — | requires `h` |
| `RoomDelete` | 9008 | delete a room | — | requires `h` |
| `RoomDeleteEvent` | 9005 | delete events from a room | `ids()` | `addId(id)`, `setIds(ids)`; requires `h` |
| `RoomJoin` | 9021 | request to join | `claim()` | `setClaim(claim)`; requires `h` |
| `RoomLeave` | 9022 | leave a room | — | requires `h` |
| `RoomAddMember` | 9000 | add a member | `pubkeys()` | `addPubkey(pk)` |
| `RoomRemoveMember` | 9001 | remove a member | `pubkeys()` | `addPubkey(pk)`, `removePubkey(pk)`, `setPubkeys(pks)` |
| `RoomCreatePermission` | 19004 | grant room-creation rights | `pubkeys()`, `canCreate(pk)` | `addPubkey(pk, role?)`, `removePubkey(pk)`, `setPubkeys(pks)` |

`RoomCreate`, `RoomLeave`, and `RoomDelete` have no fields beyond the base writer. `RoomAddMember` and `RoomRemoveMember` accumulate the affected pubkeys with `addPubkey` (deduped). `RoomDeleteEvent` e-tags the events a moderator is deleting, which is how a room admin removes someone else's message; an author deletes their own with a kind 5.

```typescript
import {Domain} from "@welshman/app"
import {RoomJoin, RoomAddMember, RoomCreate} from "@welshman/domain"

// Join request — the invite code goes in the "claim" tag, a reason in the content.
const join = app.use(Domain).writer(RoomJoin)
  .setRoom(relayUrl, roomId)
  .setClaim(inviteCode)            // ["claim", inviteCode]
  .setContent("please let me in")

// Add a member (relay/admin op)
const add = app.use(Domain).writer(RoomAddMember)
  .setRoom(relayUrl, roomId)
  .addPubkey(newMemberPubkey)

// Create a room
const create = app.use(Domain).writer(RoomCreate).setRoom(relayUrl, roomId)

await app.use(Domain).command(create).then(cmd => cmd.publish())
```

The `RoomCreate`, `RoomDelete`, `RoomDeleteEvent`, `RoomLeave`, `RoomEdit`, `RoomJoin`, and `RoomUpdatePins` writers throw from `validate()` if no `h` tag is set, so call `setRoom(relayUrl, roomId)` first.

## Publishing to the room relay

`setRoom(url, room)` sets the `h` tag and pins `forcedRoutes` to the room's host relay (`[relay(normalizeRelayUrl(url))]`). When `forcedRoutes` is non-empty, the writer's `scenario()` bypasses outbox/inbox routing and publishes only there, because the hosting relay is the source of truth for the room.

Because every room kind sets `requiresRelays = true`, `validate()` (run inside `render()`) throws `A kind N event must publish to explicit relays (via setRoom or forceRoutes)` when no relay is set.

In an app, `Domain.command` renders the writer and returns a `Command` that publishes to the pinned relay:

```typescript
import {Domain} from "@welshman/app"
import {RoomLeave} from "@welshman/domain"

const writer = app.use(Domain).writer(RoomLeave).setRoom(relayUrl, roomId)

// render() -> {event, relays}; command wraps it, publish() sends to `relays`.
const command = await app.use(Domain).command(writer)
await command.publish()
```

Without the app, `writer.renderTemplate()` returns the unsigned `EventTemplate`, `writer.relays()` returns the resolved publish relays, and `writer.render()` returns both. The caller signs the template.

## See also

- [Readers & Writers](./readers-and-writers) — the base pattern, `h` tag handling (`setRoom`/`clearRoom`/`room()`), and `d`-tag validation for the addressable kinds.
- [Lists](./lists) — `RoomList` (kind 10009), the NIP-51 list of rooms a user belongs to.
- [Relay membership](./relay-membership) — the Flotilla relay-level membership ops.
