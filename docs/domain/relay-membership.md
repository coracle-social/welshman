# Relay membership

These kinds model **relay-level** membership — Flotilla's notion of joining a relay/space, distinct from NIP-29 room membership (which is scoped to a room by an `h` tag). Where [Rooms](./rooms) deal with groups hosted *on* a relay, these events deal with belonging to the relay itself. They are all plain `EventReader` / `EventWriter` subclasses; see [Readers & Writers](./readers-and-writers) for the base pattern.

Every one of them sets `requiresRelays = true`, so it **must publish to explicit relays** — you set them with `forceRelays(...urls)` (or `setGroup(url, group)` for the group-scoped kinds) before rendering, and `render()` throws otherwise. See [Forced relays and required relays](./readers-and-writers#forced-relays-and-required-relays).

## Ops and snapshots

| Class | Kind | Purpose | Reader | Writer |
|---|---|---|---|---|
| `RelayJoin` | 28934 | join request (ephemeral) | `claim()`, `reason()` | `setClaim(claim)`, `setReason(reason)` |
| `RelayInvite` | 28935 | invite (NIP-29) | `claim()` | `setClaim(claim)` |
| `RelayLeave` | 28936 | leave marker (ephemeral) | — | — |
| `RelayAddMember` | 8000 | add a member | `pubkeys()` | `addPubkey(pk)` |
| `RelayRemoveMember` | 8001 | remove a member | `pubkeys()` | `addPubkey(pk)` |
| `RelayMembers` | 13534 | member-list snapshot | `pubkeys()`, `isMember(pk)` | `addPubkey(pk, role?)`, `removePubkey(pk)`, `setPubkeys(pks)` |

Each exported constant is a `KindFactory` pairing a reader class with a writer class (`RelayJoinReader`/`RelayJoinWriter`, `RelayMembersReader`/`RelayMembersWriter`, …). You reach the reader/writer through a `ConfiguredKind` — either `RelayJoin.configure(context).reader(event)` directly, or, in `@welshman/app`, via the `Domain` plugin, which is what the examples below use.

## Joining and leaving

A `RelayJoin` carries an optional claim code (the `claim` tag) and a free-text reason (the event content):

```typescript
import {RelayJoin} from "@welshman/domain"
import {Domain} from "@welshman/app"

const domain = app.use(Domain)

const join = await domain.reader(RelayJoin)(event)
join.claim()      // string | undefined — the "claim" tag value
join.reason()     // event.content, or undefined when empty

// A join must be published to the relay/space being joined:
const writer = domain.writer(RelayJoin)
  .forceRelays(relayUrl)       // required — RelayJoin sets requiresRelays
  .setClaim(inviteCode)        // ["claim", inviteCode]
  .setReason("hello")          // becomes the content

const command = await domain.command(writer)
await command.publish()

// Leaving is a bare marker — no fields, but still publishes to the relay.
const leave = domain.writer(RelayLeave).forceRelays(relayUrl)
await (await domain.command(leave)).publish()
```

`RelayInvite` (kind 28935) is the invite counterpart, carrying just a `claim`:

```typescript
import {RelayInvite} from "@welshman/domain"

const invite = domain.writer(RelayInvite)
  .forceRelays(relayUrl)
  .setClaim(inviteCode)

await (await domain.command(invite)).publish()
```

## Member management

`RelayAddMember` (8000) and `RelayRemoveMember` (8001) are admin ops that list affected pubkeys via `addPubkey` (deduped by pubkey):

```typescript
import {RelayAddMember, RelayRemoveMember} from "@welshman/domain"

const add = domain.writer(RelayAddMember)
  .forceRelays(relayUrl)
  .addPubkey(pubkeyA)
  .addPubkey(pubkeyB)

await (await domain.command(add)).publish()

const remove = domain.writer(RelayRemoveMember)
  .forceRelays(relayUrl)
  .addPubkey(pubkeyA)

await (await domain.command(remove)).publish()
```

`RelayMembers` (13534) is the resulting member-list snapshot. Members are carried in NIP-43 `member` tags, and the writer marks the event NIP-70 protected (`-`) in its constructor. Its reader answers membership questions; its writer supports add, remove, and a full replace:

```typescript
import {RelayMembers} from "@welshman/domain"

const members = await domain.reader(RelayMembers)(event)
members.pubkeys()          // string[]
members.isMember(pubkey)   // boolean

const writer = domain.writer(RelayMembers)
  .forceRelays(relayUrl)
  .addPubkey(pubkeyA, "admin")   // optional role; also removePubkey(pk) / setPubkeys(pks)

await (await domain.command(writer)).publish()
```

## See also

- [Readers & Writers](./readers-and-writers) — the base `EventReader`/`EventWriter` pattern, plus [forced/required relays](./readers-and-writers#forced-relays-and-required-relays).
- [Rooms](./rooms) — NIP-29 room-level (not relay-level) membership and metadata ops.
