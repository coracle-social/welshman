# @welshman/domain

[![version](https://badgen.net/npm/v/@welshman/domain)](https://npmjs.com/package/@welshman/domain)

Utilities for translating nostr events to and from domain objects. `@welshman/util` provides the raw building blocks (events, tags, kind constants, tag getters), and `@welshman/domain` provides a typed object per kind: a `Profile` you can ask `.name()`, a `FollowList` you can ask `.pubkeys()`, a `ZapReceipt` you can pass to `Zapper.validate`. Each comes with a writer that turns edits back into a signable event template and the relays that event should be published to.

## Readers, Writers, and Queries

Every supported kind is modeled by three classes:

- A **Reader** is a read-only view over a single `TrustedEvent`, with getters such as `profile.name()`, `list.pubkeys()` and `zap.amount()`.
- A **Writer** is a mutable, chainable producer of an `EventTemplate`. You construct it empty to author a new event, or from a Reader to edit an existing one, and finish with `renderTemplate()` (the template) or `render()` (the template plus the relays to publish it to).
- A **Query** is a mutable, chainable producer of the `Filter`s that fetch the kind's events. It finishes with `renderFilters()` (the filters) or `render()` (the filters plus the relays to request them from).

Each kind is exported as a **`KindFactory`** (`Profile`, `FollowList`, `MuteList`, `Note`, `RelayList`, …). You `configure()` it once with a `KindContext` (a resolver, and optionally a signer), which returns a `ConfiguredKind` whose `reader`/`writer`/`query` produce the objects:

```typescript
import {Profile} from "@welshman/domain"
import {Resolver} from "@welshman/util"

// `resolver` dereferences relay routes to urls; a signer is only needed
// to decrypt/encrypt private list tags.
const resolver = new Resolver(route => [/* urls for this route */])
const ProfileKind = Profile.configure({resolver})

// Kind 0 parses synchronously, since nothing has to be decrypted.
const profile = ProfileKind.reader(event).parse()
profile.name()            // string | undefined
profile.display()         // best-effort display name, falls back to a short npub

const template = await ProfileKind.writer()
  .setName("alice")
  .setAbout("hello nostr")
  .renderTemplate()       // EventTemplate {kind, content, tags}
```

Pass a reader to `writer()` and it comes back pre-populated, so editing is "read, mutate, rebuild". `renderTemplate()` produces an unsigned template that you sign yourself:

```typescript
import {stamp} from "@welshman/util"

const next = await ProfileKind.writer(profile).setName("alice2").renderTemplate()
const signed = await signer.sign(stamp(next))
```

`render()` returns both the template and the resolved relay list, and a query does the same for filters:

```typescript
const {event, relays} = await ProfileKind.writer().setName("alice").render()
const {filters, relays} = await ProfileKind.query().setAuthors([pubkey]).render()
```

## Where it sits

`@welshman/domain` lives between `@welshman/util` and `@welshman/app`.

- It depends on `@welshman/util` for kind constants, tag selectors, `Address`, `stamp`, the routing DSL (`Resolver`, `outbox`, `inbox`, `relay`, …), and the `TrustedEvent`/`EventTemplate` types, and on `@welshman/signer` for the `ISigner` interface used for private list tags.
- `@welshman/app` builds on it. The `Domain` plugin (`app.use(Domain)`) configures each kind with the app's resolver and current user's signer, and exposes `.reader(factory)`, `.writer(factory, reader?)`, `.query(factory)` and `.command(writer)`. The data plugins (`Profiles`, `FollowLists`, `MuteLists`, `RelayLists`, …) decode repository events into these readers, so the `Profile` that `app.use(Profiles).one(pk)` returns is a `ProfileReader`.

## Installation

```bash
npm install @welshman/domain
# or
pnpm add @welshman/domain
yarn add @welshman/domain
```

Peer dependencies: `@welshman/lib`, `@welshman/util`, `@welshman/signer`, `@welshman/net`, `@welshman/feeds` (for the saved-feed kind), and `nostr-tools`.

## A larger example

Inside an app, `app.use(Domain)` configures the kind and `command()` wraps the rendered event for publishing:

```typescript
import {MuteList} from "@welshman/domain"
import {Domain} from "@welshman/app"

// Without the author's own signer, only public tags are visible.
const list = await app.use(Domain).reader(MuteList)(event)
list.pubkeys()                  // string[] of muted pubkeys
list.includes(somePubkey)       // boolean

// Private tags are NIP-44 self-encrypted to the author on render.
const writer = app.use(Domain).writer(MuteList, list)
  .mutePrivately(newPubkey)

await app.use(Domain).command(writer).then(cmd => cmd.publish())
```

## Pages

- [Readers & Writers](./readers-and-writers) — the base classes in depth: `KindFactory`/`ConfiguredKind` and the context, sync and async parsing, getters and setters, the render pipeline, routing, validation, extra-tag passthrough, relay hints, and list encryption.
- [Profile](./profile) — kind-0 metadata (`ProfileReader` / `ProfileWriter`).
- [Lists](./lists) — NIP-51 public/private lists: follows, mutes, pins, bookmarks, relay sets, and others.
- [Rooms](./rooms) — NIP-29 rooms: metadata, pins, membership, and the join/leave/create/delete ops.
- [Relay membership](./relay-membership) — Flotilla relay/space membership ops and snapshots.
- [Handlers](./handlers) — NIP-89 handler information and recommendations.
- [Zaps](./zaps) — NIP-57/NIP-75 zap requests, receipts, and goals.
- [Content](./content) — notes, deletes, reactions, reposts, pictures, direct messages, comments, threads, articles, chat messages, classifieds, pinboards, highlights, calendar events, polls, reports, labels, saved feeds, and app data.
- [Wiki](./wiki) — NIP-54 wiki articles, redirects, and merge requests.
- [Badges](./badges) — NIP-58 badge definitions, awards, and the badges a profile displays.
