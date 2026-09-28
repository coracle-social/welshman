# Relay membership

These kinds model **relay-level** membership, Flotilla's notion of joining a relay or space. [Rooms](./rooms) are hosted on a relay and scoped by an `h` tag, while these events deal with belonging to the relay itself. They are all plain `EventReader` / `EventWriter` subclasses; see [Readers & Writers](./readers-and-writers) for the base pattern.

Every one of them sets `requiresRelays = true`, so `render()` throws unless the writer's relays were set with `forceRoutes(...routes)` (or `setRoom(url, room)`). See [Forced routes and required relays](./readers-and-writers#forced-routes-and-required-relays).

## Ops and snapshots

| Class | Kind | Purpose | Reader | Writer |
|---|---|---|---|---|
| `RelayJoin` | 28934 | join request (ephemeral) | `claim()`, `reason()` | `setClaim(claim)`, `setReason(reason)` |
| `RelayInvite` | 28935 | invite (NIP-29) | `claim()` | `setClaim(claim)` |
| `RelayLeave` | 28936 | leave marker (ephemeral) | — | — |
| `RelayAddMember` | 8000 | add a member | `pubkeys()` | `addPubkey(pk)` |
| `RelayRemoveMember` | 8001 | remove a member | `pubkeys()` | `addPubkey(pk)` |
| `RelayMembers` | 13534 | member-list snapshot | `pubkeys()`, `isMember(pk)`, `rolesFor(pk)`, `rolesByPubkey()` | `addPubkey(pk, roles?)`, `removePubkey(pk)`, `setPubkeys(pks)` |

Each exported constant is a `KindFactory` bundling a reader and writer class (`RelayJoinReader`/`RelayJoinWriter`, `RelayMembersReader`/`RelayMembersWriter`, …). The examples below reach them through the `@welshman/app` `Domain` plugin.

## Joining and leaving

A `RelayJoin` carries an optional claim code (the `claim` tag) and a free-text reason (the event content). The `RelayJoin` and `RelayLeave` writers mark their events NIP-70 protected (`-`).

```typescript
import {relay} from "@welshman/util"
import {RelayJoin, RelayLeave} from "@welshman/domain"
import {Domain} from "@welshman/app"

const domain = app.use(Domain)

const join = domain.reader(RelayJoin)(event)
join.claim()      // string | undefined — the "claim" tag value
join.reason()     // event.content, or undefined when empty

// A join is published to the relay being joined:
const writer = domain.writer(RelayJoin)
  .forceRoutes(relay(relayUrl))  // required — RelayJoin sets requiresRelays
  .setClaim(inviteCode)          // ["claim", inviteCode]
  .setReason("hello")            // becomes the content

const command = await domain.command(writer)
await command.publish()

// Leaving has no fields, but still publishes to the relay.
const leave = domain.writer(RelayLeave).forceRoutes(relay(relayUrl))
await (await domain.command(leave)).publish()
```

`RelayInvite` (kind 28935) carries just a `claim`:

```typescript
import {RelayInvite} from "@welshman/domain"

const invite = domain.writer(RelayInvite)
  .forceRoutes(relay(relayUrl))
  .setClaim(inviteCode)

await (await domain.command(invite)).publish()
```

## Member management

`RelayAddMember` (8000) and `RelayRemoveMember` (8001) are admin ops that list the affected pubkeys via `addPubkey` (deduped):

```typescript
import {RelayAddMember, RelayRemoveMember} from "@welshman/domain"

const add = domain.writer(RelayAddMember)
  .forceRoutes(relay(relayUrl))
  .addPubkey(pubkeyA)
  .addPubkey(pubkeyB)

await (await domain.command(add)).publish()

const remove = domain.writer(RelayRemoveMember)
  .forceRoutes(relay(relayUrl))
  .addPubkey(pubkeyA)

await (await domain.command(remove)).publish()
```

`RelayMembers` (13534) is the member-list snapshot. Members are carried in NIP-43 `member` tags, `["member", pubkey, ...roleIds]`, and the writer marks the event NIP-70 protected (`-`), as NIP-43 requires.

```typescript
import {RelayMembers} from "@welshman/domain"

const members = domain.reader(RelayMembers)(event)
members.pubkeys()          // string[]
members.isMember(pubkey)   // boolean
members.rolesFor(pubkey)   // string[] of role ids
members.rolesByPubkey()    // Map<pubkey, role ids>

const writer = domain.writer(RelayMembers)
  .forceRoutes(relay(relayUrl))
  .addPubkey(pubkeyA, ["admin"]) // replaces roles; omit to keep existing ones. Also removePubkey(pk) / setPubkeys(pks)

await (await domain.command(writer)).publish()
```

## See also

- [Readers & Writers](./readers-and-writers) — the base `EventReader`/`EventWriter` pattern.
- [Rooms](./rooms) — NIP-29 room-level membership and metadata ops.
