# Relay membership

These kinds model **relay-level** membership — Flotilla's notion of joining a relay/space, distinct from NIP-29 room membership (which is scoped to a room by an `h` tag). Where [Rooms](./rooms) deal with groups hosted *on* a relay, these events deal with belonging to the relay itself. They are all plain `EventReader` / `EventBuilder` subclasses; see [Readers & Builders](./readers-and-builders) for the base pattern.

## Ops and snapshots

| Class | Kind | Purpose | Reader | Builder |
|---|---|---|---|---|
| `RelayJoin` | 28934 | join request (ephemeral) | `claim()`, `reason()` | `setClaim(claim)`, `setReason(reason)` |
| `RelayInvite` | 28935 | invite (NIP-29) | `claim()` | `setClaim(claim)` |
| `RelayLeave` | 28936 | leave marker (ephemeral) | — | — |
| `RelayAddMember` | 8000 | add a member | `pubkeys()` | `addPubkey(pk)` |
| `RelayRemoveMember` | 8001 | remove a member | `pubkeys()` | `addPubkey(pk)` |
| `RelayMembers` | 13534 | member-list snapshot | `pubkeys()`, `isMember(pk)` | `addPubkey(pk)`, `removePubkey(pk)` |

Each has a matching `*Builder` (`RelayJoinBuilder`, `RelayMembersBuilder`, …).

## Joining and leaving

A `RelayJoin` carries an optional claim code (the `claim` tag) and a free-text reason (the event content):

```typescript
import {RelayJoin, RelayJoinBuilder, RelayLeaveBuilder} from "@welshman/domain"

const join = await RelayJoin.fromEvent(event)
join.claim()      // string | undefined — the "claim" tag value
join.reason()     // event.content, or undefined when empty

await new RelayJoinBuilder()
  .setClaim(inviteCode)        // ["claim", inviteCode]
  .setReason("hello")          // becomes the content
  .toEvent(signer)

// Leaving is a bare marker — no fields.
await new RelayLeaveBuilder().toEvent(signer)
```

`RelayInvite` (kind 28935) is the invite counterpart, carrying just a `claim`:

```typescript
import {RelayInviteBuilder} from "@welshman/domain"

await new RelayInviteBuilder().setClaim(inviteCode).toEvent(signer)
```

## Member management

`RelayAddMember` (8000) and `RelayRemoveMember` (8001) are admin ops that list affected pubkeys via `addPubkey` (deduped by pubkey):

```typescript
import {RelayAddMemberBuilder, RelayRemoveMemberBuilder} from "@welshman/domain"

await new RelayAddMemberBuilder()
  .addPubkey(pubkeyA)
  .addPubkey(pubkeyB)
  .toEvent(signer)

await new RelayRemoveMemberBuilder().addPubkey(pubkeyA).toEvent(signer)
```

`RelayMembers` (13534) is the resulting member-list snapshot. Its reader answers membership questions; its builder supports both add and remove:

```typescript
import {RelayMembers, RelayMembersBuilder} from "@welshman/domain"

const members = await RelayMembers.fromEvent(event)
members.pubkeys()          // string[]
members.isMember(pubkey)   // boolean

await new RelayMembersBuilder()
  .addPubkey(pubkeyA)      // also removePubkey(pk)
  .toEvent(signer)
```

## See also

- [Readers & Builders](./readers-and-builders) — the base `EventReader`/`EventBuilder` pattern.
- [Rooms](./rooms) — NIP-29 room-level (not relay-level) membership and metadata ops.
