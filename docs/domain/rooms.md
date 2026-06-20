# Rooms

NIP-29 rooms are relay-hosted groups. `@welshman/domain` models the room metadata kinds plus the full set of moderation/membership operations. There are two flavors of event here:

- **Addressable metadata** (kinds 39000–39002) — replaceable, identified by a `d` tag, written by the relay. These are the canonical state of a room.
- **Action ops** (kinds 9000–9022, 19004) — regular events scoped to a target room by the NIP-29 **`h` group tag** (set via the base `setGroup` / `clearGroup`, read via `group()`).

All of these are plain `EventReader` / `EventBuilder` subclasses — none of them are encrypted lists. See [Readers & Builders](./readers-and-builders) for the base pattern. The reactive `app.use(Rooms)` plugin in `@welshman/app` builds on these classes.

## Room metadata

`RoomMeta` (kind 39000) is the addressable metadata record. Because it is parameterized-replaceable, the builder needs a `d` tag (`setIdentifier()`).

```typescript
import {RoomMeta, RoomMetaBuilder} from "@welshman/domain"

const meta = await RoomMeta.fromEvent(event)
meta.name()           // string | undefined
meta.about()          // string | undefined
meta.picture()        // tag[1]
meta.pictureMeta()    // tag.slice(2) — imeta-style extras, or undefined
meta.isClosed()       // boolean (presence of a ["closed"] tag)
meta.isHidden()       // boolean
meta.isPrivate()      // boolean
meta.isRestricted()   // boolean
meta.hasLivekit()     // boolean

const template = await new RoomMetaBuilder()
  .setIdentifier("my-room")
  .setName("General")
  .setAbout("anything goes")
  .setPicture("https://example.com/room.png")
  .setClosed()        // ["closed"]; pass false to clear
  .toTemplate()
```

Flag setters (`setClosed`, `setHidden`, `setPrivate`, `setRestricted`, `setLivekit`) each take an optional boolean (default `true`) — passing `false` clears the tag. `setPicture(picture, meta = [])` appends the extra imeta elements.

`RoomEdit` (kind 9002) carries the **same metadata fields** but as an *action* event scoped via the `h` group tag rather than a `d` identifier — it is how a client requests a metadata change. Its reader/builder are identical to `RoomMeta`, with one naming difference: the livekit getter is `livekit()` here (vs `hasLivekit()` on `RoomMeta`).

```typescript
import {RoomEditBuilder} from "@welshman/domain"

await new RoomEditBuilder()
  .setGroup(roomId)       // h tag — which room to edit
  .setName("Renamed")
  .toEvent(signer)
```

## Admins and members (addressable)

`RoomAdmins` (39001) and `RoomMembers` (39002) are addressable p-tag lists.

```typescript
import {RoomAdmins, RoomMembers, RoomMembersBuilder} from "@welshman/domain"

const admins = await RoomAdmins.fromEvent(event)
admins.pubkeys()                 // string[]

const members = await RoomMembers.fromEvent(event)
members.members()                // string[]
members.isMember(pubkey)         // boolean

await new RoomMembersBuilder()
  .setIdentifier(roomId)
  .addMember(pubkeyA)            // also removeMember(pk)
  .toEvent(signer)
```

`RoomAdminsBuilder` exposes `addAdmin(pk)` / `removeAdmin(pk)`; `RoomMembersBuilder` exposes `addMember(pk)` / `removeMember(pk)`. Both dedupe by pubkey.

## Membership and lifecycle ops

These are scoped to a room by the `h` group tag. Several enforce its presence in `validate()`.

| Class | Kind | Purpose | Reader | Builder |
|---|---|---|---|---|
| `RoomCreate` | 9007 | create a room | — | — |
| `RoomDelete` | 9008 | delete a room | — | requires `h` group |
| `RoomJoin` | 9021 | request to join | `code()`, `reason()` | `setCode(code)`, `setReason(reason)`; requires `h` group |
| `RoomLeave` | 9022 | leave a room | — | requires `h` group |
| `RoomAddMember` | 9000 | add a member | `pubkeys()` | `addPubkey(pk)` |
| `RoomRemoveMember` | 9001 | remove a member | `pubkeys()` | `addPubkey(pk)` |
| `RoomCreatePermission` | 19004 | grant room-creation rights | `pubkeys()`, `canCreate(pk)` | `setPubkeys(pks)` |

`RoomCreate` and `RoomLeave`/`RoomDelete` have no extra fields beyond the base builder — they are marker events. The members ops (`RoomAddMember`, `RoomRemoveMember`) use `addPubkey` to accumulate the affected pubkeys (deduped); `RoomRemoveMember`'s p-tags list the pubkeys to remove.

```typescript
import {RoomJoinBuilder, RoomAddMemberBuilder, RoomCreateBuilder} from "@welshman/domain"

// Join request — code is the "claim" tag, reason is the content.
await new RoomJoinBuilder()
  .setGroup(roomId)
  .setCode(inviteCode)            // ["claim", inviteCode]
  .setReason("please let me in")
  .toEvent(signer)

// Add a member (relay/admin op)
await new RoomAddMemberBuilder()
  .setGroup(roomId)
  .addPubkey(newMemberPubkey)
  .toEvent(signer)

// Create a room
await new RoomCreateBuilder().setGroup(roomId).toEvent(signer)
```

::: tip Naming quirks
- `RoomJoin` stores the invite under the `claim` tag, but the accessor is `code()` (and the setter is `setCode`).
- `RoomCreatePermission` uses `setPubkeys(pks)` (replace-all), not an `add*` method.
- `RoomDelete`, `RoomLeave`, and `RoomJoin` builders throw from `validate()` if no `h` group is set — always `setGroup(roomId)` first.
:::

## See also

- [Readers & Builders](./readers-and-builders) — the base pattern, the `h`/group tag handling (`setGroup`/`clearGroup`/`group()`), and `d`-tag validation for the addressable kinds.
- [Lists](./lists) — `RoomList` (kind 10009), the NIP-51 membership list that tracks which rooms a user belongs to.
- [Relay membership](./relay-membership) — the Flotilla relay-level (non-NIP-29) membership ops.
