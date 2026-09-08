# Rooms

NIP-29 rooms are hosted by a relay. (The spec calls them groups; this package calls them rooms throughout — reader, writer, and plugin APIs all say "room", and only the wire-level `h` and `group` tag names keep the spec's word.) `@welshman/domain` models the room metadata kinds plus the full set of moderation/membership operations. There are two flavors of event here:

- **Addressable metadata** (kinds 39000–39002) — replaceable, identified by a `d` tag, written by the relay. These are the canonical state of a room.
- **Action ops** (kinds 9000–9022, 19004) — regular events scoped to a target room by the NIP-29 **`h` tag** (set via the base `setRoom` / `clearRoom`, read via `room()`).

All of these are plain `EventReader` / `EventWriter` subclasses — none of them are encrypted lists. See [Readers & Writers](./readers-and-writers) for the base pattern (`configure` → `reader`/`writer`, `render`, routing). The reactive `app.use(Rooms)` plugin in `@welshman/app` builds on these classes.

Because every event here targets a specific relay, **all of these kinds set `requiresRelays = true`**: a writer's `validate()` throws unless the target relay has been set with `setRoom(url, room)` (or `forceRoutes(relay(url))`). That relay is the room's host, and the resulting event publishes *only* there — see [Publishing to the room relay](#publishing-to-the-room-relay).

## Room metadata

`RoomMeta` (kind 39000) is the addressable metadata record. Because it is parameterized-replaceable, the writer needs a `d` tag (`setIdentifier()`).

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

Flag setters (`setClosed`, `setHidden`, `setPrivate`, `setRestricted`, `setLivekit`) each take an optional boolean (default `true`) — passing `false` clears the tag. `setPicture(picture, meta = [])` appends the extra imeta elements.

`RoomEdit` (kind 9002) carries the **same metadata fields** but as an *action* event scoped via the `h` tag rather than a `d` identifier — it is how a client requests a metadata change. Its reader/writer mirror `RoomMeta`, with one naming difference: the livekit getter is `livekit()` here (vs `hasLivekit()` on `RoomMeta`).

```typescript
import {Domain} from "@welshman/app"
import {RoomEdit} from "@welshman/domain"

const writer = app.use(Domain).writer(RoomEdit)
  .setRoom(relayUrl, roomId)   // host relay + h tag — which room to edit
  .setName("Renamed")

await app.use(Domain).command(writer).then(cmd => cmd.publish())
```

## Admins and members (addressable)

`RoomAdmins` (39001) and `RoomMembers` (39002) are addressable p-tag lists.

```typescript
import {Domain} from "@welshman/app"
import {RoomAdmins, RoomMembers} from "@welshman/domain"

const admins = app.use(Domain).reader(RoomAdmins)(event)
admins.pubkeys()                 // string[]

const members = app.use(Domain).reader(RoomMembers)(event)
members.members()                // string[]
members.isMember(pubkey)         // boolean

const writer = app.use(Domain).writer(RoomMembers)
  .setRoom(relayUrl, roomId)
  .setIdentifier(roomId)
  .addPubkey(pubkeyA)            // also removePubkey(pk) / setPubkeys(pks)
```

Both `RoomAdminsWriter` and `RoomMembersWriter` expose the same `addPubkey(pk)` / `removePubkey(pk)` / `setPubkeys(pks)` methods, deduping by pubkey.

## Membership and lifecycle ops

These are scoped to a room by the `h` tag. All set `requiresRelays = true`, and several also throw from `validate()` if no `h` tag is present.

| Class | Kind | Purpose | Reader | Writer |
|---|---|---|---|---|
| `RoomCreate` | 9007 | create a room | — | requires `h` |
| `RoomDelete` | 9008 | delete a room | — | requires `h` |
| `RoomJoin` | 9021 | request to join | `claim()`, `reason()` | `setClaim(claim)`, `setReason(reason)`; requires `h` |
| `RoomLeave` | 9022 | leave a room | — | requires `h` |
| `RoomAddMember` | 9000 | add a member | `pubkeys()` | `addPubkey(pk)` |
| `RoomRemoveMember` | 9001 | remove a member | `pubkeys()` | `addPubkey(pk)`, `removePubkey(pk)`, `setPubkeys(pks)` |
| `RoomCreatePermission` | 19004 | grant room-creation rights | `pubkeys()`, `canCreate(pk)` | `addPubkey(pk, role?)`, `removePubkey(pk)`, `setPubkeys(pks)` |

`RoomCreate`, `RoomLeave`, and `RoomDelete` have no extra fields beyond the base writer — they are marker events. The members ops (`RoomAddMember`, `RoomRemoveMember`) use `addPubkey` to accumulate the affected pubkeys (deduped); `RoomRemoveMember`'s p-tags list the pubkeys to remove.

```typescript
import {Domain} from "@welshman/app"
import {RoomJoin, RoomAddMember, RoomCreate} from "@welshman/domain"

// Join request — claim is the "claim" tag, reason is the content.
const join = app.use(Domain).writer(RoomJoin)
  .setRoom(relayUrl, roomId)
  .setClaim(inviteCode)            // ["claim", inviteCode]
  .setReason("please let me in")

// Add a member (relay/admin op)
const add = app.use(Domain).writer(RoomAddMember)
  .setRoom(relayUrl, roomId)
  .addPubkey(newMemberPubkey)

// Create a room
const create = app.use(Domain).writer(RoomCreate).setRoom(relayUrl, roomId)

await app.use(Domain).command(create).then(cmd => cmd.publish())
```

::: tip Naming quirks
- `RoomJoin` stores the invite under the `claim` tag; the accessor is `claim()` and the setter is `setClaim`.
- `RoomCreatePermission` also exposes `setPubkeys(pks)` (replace-all) alongside `addPubkey`/`removePubkey`; `addPubkey` accepts an optional `role`.
- `RoomCreate`, `RoomDelete`, `RoomLeave`, `RoomEdit`, and `RoomJoin` writers throw from `validate()` if no `h` tag is set — always `setRoom(relayUrl, roomId)` first.
:::

## Publishing to the room relay

`setRoom(url, room)` does two things: it sets the `h` tag **and** pins `forcedRoutes` to the room's host relay (`[relay(normalizeRelayUrl(url))]`). When `forcedRoutes` is non-empty, the writer's `scenario()` bypasses the usual outbox/inbox routing and publishes **only** there — exactly what NIP-29 requires, since the hosting relay is the source of truth for the room.

Because every room kind sets `requiresRelays = true`, `validate()` (run inside `render()`) throws `A kind N event must publish to explicit relays (via setRoom or forceRoutes)` if you forgot to set a relay. `RoomCreate` additionally requires the `h` tag.

The app path finalizes the writer and hands you a `Command` that publishes to the pinned relay:

```typescript
import {Domain} from "@welshman/app"
import {RoomLeave} from "@welshman/domain"

const writer = app.use(Domain).writer(RoomLeave).setRoom(relayUrl, roomId)

// render() -> {event, relays}; command wraps it, publish() sends to `relays`.
const command = await app.use(Domain).command(writer)
await command.publish()
```

For an admin op that the relay must sign with its own key (NIP-86 `signevent`), use `command.publishAsRelay(url)` instead of `publish()`.

If you need the raw pieces (e.g. in tests, without the app), call the writer's terminal methods directly: `writer.renderTemplate()` returns the unsigned `EventTemplate`, `writer.relays()` returns the resolved publish relays, and `writer.render()` returns both. There is no `toTemplate`/`toEvent`/`toRumor` — the caller signs the template from `renderTemplate()`.

## See also

- [Readers & Writers](./readers-and-writers) — the base pattern, the `configure`/`reader`/`writer` entry model, the `h` tag handling (`setRoom`/`clearRoom`/`room()`), and `d`-tag validation for the addressable kinds.
- [Lists](./lists) — `RoomList` (kind 10009), the NIP-51 membership list that tracks which rooms a user belongs to.
- [Relay membership](./relay-membership) — the Flotilla relay-level (non-NIP-29) membership ops.
