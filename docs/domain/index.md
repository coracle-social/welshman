# @welshman/domain

[![version](https://badgen.net/npm/v/@welshman/domain)](https://npmjs.com/package/@welshman/domain)

Stateless utilities for translating nostr events to and from domain objects. Where `@welshman/util` gives you the raw building blocks — events, tags, kind constants, tag getters — `@welshman/domain` gives you a typed, ergonomic object per kind: a `Profile` you can ask `.name()`, a `FollowList` you can ask `.pubkeys()`, a `ZapReceipt` you can `.verify()`. Each of those comes with a matching builder that turns edits back into a signable event template.

## The core idea: Readers and Builders

Every supported kind is modeled by a pair of classes:

- A **Reader** — a read-only view over a single `TrustedEvent`. You construct it from an event, and it decodes the content/tags into convenient getters (`profile.name()`, `list.pubkeys()`, `zap.amount()`). Readers are stateless: they hold the event and answer questions about it.
- A **Builder** — a mutable, chainable producer of an `EventTemplate`. You construct it empty (to author a new event) or from a Reader (to edit an existing one), apply setters, and finish with `toTemplate()` / `toRumor()` / `toEvent()`.

```typescript
import {Profile, ProfileBuilder} from "@welshman/domain"

// Read an event into a domain object
const profile = await Profile.fromEvent(event)
profile.name()            // string | undefined
profile.display()         // best-effort display name, falls back to a short npub

// Build a new event template
const template = await new ProfileBuilder()
  .setName("alice")
  .setAbout("hello nostr")
  .toTemplate()           // EventTemplate {kind, content, tags}
```

Readers and Builders are two halves of a round-trip. `reader.builder()` returns the matching builder pre-populated from the reader, so editing is just "read, mutate, rebuild":

```typescript
const next = await profile.builder().setName("alice2").toTemplate()
```

## Where it sits

`@welshman/domain` lives between `@welshman/util` and `@welshman/app`.

- It depends on `@welshman/util` for the primitives it wraps — kind constants (`PROFILE`, `FOLLOWS`, `RELAYS`, …), tag getters (`getTagValue`, `getPubkeyTagValues`, …), `Address`, `stamp`/`prep`, and the `TrustedEvent`/`EventTemplate` types. It depends on `@welshman/signer` for the `ISigner` interface (used to sign, and to decrypt/encrypt private list tags).
- `@welshman/app` is built on top of it. The reactive data plugins (`Profiles`, `FollowLists`, `MuteLists`, `RelayLists`, …) decode repository events into exactly these Reader objects and expose the Builders' setters as collection methods. If you have used `app.use(Profiles).one(pk)` and gotten a `Profile` back, that `Profile` is this package's `Profile`.

This means `@welshman/domain` is the right layer to reach for when you are working with events directly — parsing or constructing them — without the app's reactivity, networking, or repository. It has no module-level state and no side effects.

## Installation

```bash
npm install @welshman/domain
# or
pnpm add @welshman/domain
yarn add @welshman/domain
```

Peer dependencies: the welshman workspace packages it builds on (`@welshman/lib`, `@welshman/util`, `@welshman/signer`, and `@welshman/feeds` for the saved-feed kind), plus `nostr-tools`.

## A larger example

```typescript
import {FollowList, FollowListBuilder} from "@welshman/domain"

// Read — pass a signer to unlock private (encrypted) tags on lists.
// Without the author's own signer, only public tags are visible.
const list = await FollowList.fromEvent(event, signer)
list.pubkeys()                  // string[] of followed pubkeys
list.includes(somePubkey)       // boolean

// Edit and sign in one chain. buildContent encrypts private tags
// (NIP-44, self-encrypted to the author) when there are any.
const signed = await list.builder()
  .addFollow(["p", newPubkey])
  .toEvent(signer)              // SignedEvent

// Or start fresh
const template = await new FollowListBuilder()
  .addFollow(["p", pubkeyA])
  .addFollow(["p", pubkeyB])
  .toTemplate()
```

## Pages

- [Readers & Builders](./readers-and-builders) — the `EventReader`/`EventBuilder` and `ListReader`/`ListBuilder` base classes in depth: construction, async parsing, getters/setters, the build pipeline, validation, extra-tag passthrough, and how list encryption works.
- [Profile](./profile) — kind-0 metadata (`Profile` / `ProfileBuilder`).
- [Lists](./lists) — NIP-51 public/private lists: follows, mutes, pins, bookmarks, relay sets, and friends.
- [Rooms](./rooms) — NIP-29 group rooms: metadata, membership, and the join/leave/create/delete ops.
- [Relay membership](./relay-membership) — Flotilla relay/space membership ops and snapshots.
- [Handlers](./handlers) — NIP-89 handler information and recommendations.
- [Zaps](./zaps) — NIP-57/NIP-75 zap requests, receipts, and goals.
- [Content](./content) — comments, threads, classifieds, calendar events, polls, and reports.
