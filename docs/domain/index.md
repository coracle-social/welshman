# @welshman/domain

[![version](https://badgen.net/npm/v/@welshman/domain)](https://npmjs.com/package/@welshman/domain)

Utilities for translating nostr events to and from domain objects. Where `@welshman/util` gives you the raw building blocks — events, tags, kind constants, tag getters — `@welshman/domain` gives you a typed, ergonomic object per kind: a `Profile` you can ask `.name()`, a `FollowList` you can ask `.pubkeys()`, a `ZapReceipt` you can `.verify()`. Each of those comes with a matching writer that turns edits back into a signable event template — and, because the same objects know how to route themselves, into the set of relays that event should be published to.

## The core idea: Readers and Writers

Every supported kind is modeled by a pair of classes:

- A **Reader** — a read-only view over a single `TrustedEvent`. It decodes the content/tags into convenient getters (`profile.name()`, `list.pubkeys()`, `zap.amount()`). Readers hold the event and answer questions about it; some (lists) also `parse()` asynchronously to decrypt private tags.
- A **Writer** — a mutable, chainable producer of an `EventTemplate`. You construct it empty (to author a new event) or from a Reader (to edit an existing one), apply setters, and finish with `renderTemplate()` (the template) or `render()` (the template plus the relays to publish it to).

You don't instantiate these classes directly. Each kind is exported as a **`KindFactory`** — `Profile`, `FollowList`, `MuteList`, `Note`, `RelayList`, … — and you `configure()` it once with a `KindContext` (a resolver, and optionally a signer and repository). Configuring binds those dependencies and hands back a `ConfiguredKind` whose `reader`/`writer` produce the actual objects:

```typescript
import {Profile} from "@welshman/domain"
import {Resolver} from "@welshman/util"

// Bind dependencies once. `resolver` dereferences relay routes to urls;
// a signer is only needed to decrypt/encrypt private list tags.
const resolver = new Resolver(route => [/* urls for this route */])
const ProfileKind = Profile.configure({resolver})

// Read an event into a domain object (async: validates kind, runs parse()).
const profile = await ProfileKind.reader(event)
profile.name()            // string | undefined
profile.display()         // best-effort display name, falls back to a short npub

// Build a new event template.
const template = await ProfileKind.writer()
  .setName("alice")
  .setAbout("hello nostr")
  .renderTemplate()       // EventTemplate {kind, content, tags}
```

Readers and Writers are two halves of a round-trip. Pass a reader to `writer()` and it comes back pre-populated, so editing is just "read, mutate, rebuild":

```typescript
const next = await ProfileKind.writer(profile).setName("alice2").renderTemplate()
```

`renderTemplate()` produces an unsigned `EventTemplate`; you sign it yourself:

```typescript
import {stamp} from "@welshman/util"

const signed = await signer.sign(stamp(await ProfileKind.writer(profile).setName("alice2").renderTemplate()))
```

Writers also know where their event belongs. `render()` returns both the template and the resolved relay list, and `scenario()`/`relays()` expose the routing directly:

```typescript
const {event, relays} = await ProfileKind.writer().setName("alice").render()
```

## Where it sits

`@welshman/domain` lives between `@welshman/util` and `@welshman/app`.

- It depends on `@welshman/util` for the primitives it wraps — kind constants (`PROFILE`, `FOLLOWS`, `RELAYS`, …), tag selectors (`tagValue`, `tagValues`, `hexTags`, …), `Address`, `stamp`/`prep`, the routing DSL (`Resolver`, `outbox`, `inbox`, `relay`, …), and the `TrustedEvent`/`EventTemplate` types. It depends on `@welshman/signer` for the `ISigner` interface (used to decrypt/encrypt private list tags) and `@welshman/net` for the `Repository` type routers can consult.
- `@welshman/app` is built on top of it. The `Domain` plugin (`app.use(Domain)`) memoizes a `ConfiguredKind` per factory — wiring the resolver, repository, and current user's signer in for you — and exposes `.reader(factory)` / `.writer(factory, reader?)` plus `.command(writer)` to publish. The reactive data plugins (`Profiles`, `FollowLists`, `MuteLists`, `RelayLists`, …) decode repository events into exactly these Reader objects and expose the Writers' setters as collection methods. If you have used `app.use(Profiles).one(pk)` and gotten a `Profile` back, that `Profile` is this package's `ProfileReader`.

This means `@welshman/domain` is the right layer to reach for when you are working with events directly — parsing or constructing them — while the app takes care of dependency wiring, networking, and the repository.

## Installation

```bash
npm install @welshman/domain
# or
pnpm add @welshman/domain
yarn add @welshman/domain
```

Peer dependencies: the welshman workspace packages it builds on (`@welshman/lib`, `@welshman/util`, `@welshman/signer`, `@welshman/net`, and `@welshman/feeds` for the saved-feed kind), plus `nostr-tools`.

## A larger example

Inside an app, `app.use(Domain)` does the `configure()` for you and `command()` finalizes and publishes:

```typescript
import {MuteList} from "@welshman/domain"
import {Domain} from "@welshman/app"

// Read — the configured signer unlocks private (encrypted) tags on lists.
// Without the author's own signer, only public tags are visible.
const list = await app.use(Domain).reader(MuteList)(event)
list.pubkeys()                  // string[] of muted pubkeys
list.includes(somePubkey)       // boolean

// Edit and publish. buildContent encrypts private tags (NIP-44,
// self-encrypted to the author) when there are any.
const writer = app.use(Domain).writer(MuteList, list)
  .mutePrivately(newPubkey)

await app.use(Domain).command(writer).then(cmd => cmd.publish())
```

Standalone (no app), construct the writer from a configured kind and render/sign it yourself:

```typescript
import {FollowList} from "@welshman/domain"
import {Resolver, stamp} from "@welshman/util"

const FollowListKind = FollowList.configure({resolver})

const template = await FollowListKind.writer()
  .follow(pubkeyA)
  .follow(pubkeyB)
  .renderTemplate()

const signed = await signer.sign(stamp(template))
```

## Pages

- [Readers & Writers](./readers-and-writers) — the `EventReader`/`EventWriter` and `ListReader`/`ListWriter` base classes in depth: `KindFactory`/`ConfiguredKind` and the context, async parsing, getters/setters, the `renderTemplate`/`render` pipeline, routing (`scenario`/`relays`), validation, extra-tag passthrough, relay hints, and how list encryption works.
- [Profile](./profile) — kind-0 metadata (`ProfileReader` / `ProfileWriter`).
- [Lists](./lists) — NIP-51 public/private lists: follows, mutes, pins, bookmarks, relay sets, and friends.
- [Rooms](./rooms) — NIP-29 group rooms: metadata, membership, and the join/leave/create/delete ops.
- [Relay membership](./relay-membership) — Flotilla relay/space membership ops and snapshots.
- [Handlers](./handlers) — NIP-89 handler information and recommendations.
- [Zaps](./zaps) — NIP-57/NIP-75 zap requests, receipts, and goals.
- [Content](./content) — comments, threads, classifieds, calendar events, polls, and reports.
