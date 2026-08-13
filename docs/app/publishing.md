# Publishing Events

Publishing in `@welshman/app` is **optimistic** and built around *thunks*. A thunk writes the event to the local repository immediately (so the UI updates instantly), signs lazily, optionally gift-wraps (NIP-59) and computes proof-of-work (NIP-13), and reports acceptance/rejection per relay. The signing/publishing can be delayed, giving you a soft-undo window.

Publishing is managed by the `Thunks` plugin: `app.use(Thunks)`.

## Publishing to specific relays

```typescript
import {makeEvent, NOTE} from "@welshman/util"

const thunk = app.use(Thunks).publish({
  event: makeEvent(NOTE, {content: "hi"}),
  relays: ["wss://relay.example"],
})
```

## Publishing to the outbox

There's no dedicated outbox helper on `Thunks` — resolve the current user's write relays yourself (via the [Router](./routing)) and pass them to `publish`. This is what [`Command.publish()`](#commands) does under the hood for every data-plugin mutation.

```typescript
import {userOutbox} from "@welshman/util"

const scenario = await app.use(Router).resolve([userOutbox()])

const thunk = app.use(Thunks).publish({
  event: makeEvent(NOTE, {content: "hi"}),
  relays: scenario.getUrls(),
  delay: 3000,            // wait 3s before signing/sending — abortable until then
})
```

## `ThunkOptions`

```typescript
type ThunkOptions = Override<PublishOptions, {
  app: IApp                 // injected for you by Thunks.publish
  event: EventTemplate
  recipient?: string              // present → NIP-59 gift-wrap to this pubkey
  delay?: number                  // ms to wait before signing/sending (soft-undo)
  pow?: number                    // NIP-13 proof-of-work difficulty
}>
```

`publish` accepts these options minus `app`.

## Working with a thunk

A thunk is a Svelte store; subscribe to watch per-relay progress.

```typescript
const thunk = app.use(Thunks).publish({event, relays})

thunk.subscribe(t => console.log(t.results))   // PublishResultsByRelay

// Soft-undo: only effective before `delay` elapses
thunk.abort()

// Inspect status
thunk.getCompleteUrls()
thunk.getIncompleteUrls()
thunk.getFailedUrls()
thunk.isComplete()
thunk.getError()                  // string | undefined

// Await outcomes
await thunk.waitForCompletion()   // resolves when no relay is still pending
await thunk.waitForError()        // resolves with the first error string
```

## Optimistic-publish history

The `Thunks` manager keeps a log of all thunks and supports retrying:

```typescript
const thunks = app.use(Thunks)

thunks.history                    // writable<Thunk[]> — the optimistic publish log
thunks.retry(thunk)               // re-publish a (possibly merged) thunk
```

Each thunk is queued (batched) and its event is written to the repository and tracker the moment it is enqueued, so derived stores reflect it before any relay has responded. If a thunk is aborted before sending, its event and wrap are removed from the repository and its history entry is dropped.

## Commands

The [data plugins](./data)' mutation methods (`follow`, `update`, `addRelay`, `setRelays`, `Rooms.create`/`edit`/etc.) don't publish directly — they build the event and the relays it belongs on, and return a `Command` for the caller to decide how (or whether) to publish it.

```typescript
import type {Command} from "@welshman/app"

const command: Command = await app.use(FollowLists).follow(["p", otherPubkey])

command.app       // the IApp it was built for
command.event      // EventTemplate — unsigned, inspectable before publishing
command.relays     // string[] — where publish() will send it

command.publish()             // the normal path: app.use(Thunks).publish({event, relays})
command.publishToRelays(urls)  // same, but override the relay set
command.publishAsRelay(url)    // NIP-86: ask the relay to sign with its own key
                               // (signevent), then publish the relay-signed event back
command.signAsRelay(url)       // just the NIP-86 sign step, without publishing
```

`publishAsRelay` is for cases like NIP-29 room management or NIP-86-adjacent workflows, where the relay itself must sign the event (via `app.use(RelayManagement).forUrl(url).signEvent`) rather than routing a user-signed event through the outbox model.

Since mutation methods are themselves `async`, calling `.publish()` on the result normally means a double `await`. `publish`, `publishToRelays`, `publishAsRelay`, and `signAsRelay` are also exported as free functions so you can chain them onto the outer promise instead:

```typescript
import {publish, publishAsRelay} from "@welshman/app"

await app.use(FollowLists).follow(["p", otherPubkey]).then(publish)
await app.use(Rooms).leave(relayUrl, roomMeta).then(publish)
await app.use(Rooms).join(relayUrl, roomMeta).then(publishAsRelay(relayUrl))
```

`Wraps.publish` is the one mutation that still publishes directly rather than returning a `Command`: it fans a single rumor out into a `MergedThunk` of per-recipient wraps, each with its own relay set, which doesn't fit the one-event/one-relay-set shape a `Command` assumes.

### Building a command from a domain writer

Under the hood, every mutation method builds its event with a [`@welshman/domain`](../domain) *writer* and hands it to `app.use(Domain).command(writer)`. You can drive that flow directly. `app.use(Domain).writer(Kind, reader?)` returns a fresh writer — optionally seeded from an existing reader for an edit — and its setters are chainable (each returns the writer):

```typescript
import {FollowList} from "@welshman/domain"
import {Domain} from "@welshman/app"

// Seed from the current follow list, then mutate.
const reader = await app.use(FollowLists).forceLoad(user.pubkey)

const writer = app.use(Domain)
  .writer(FollowList, reader)
  .follow(otherPubkey)

const command = await app.use(Domain).command(writer)   // -> Command
```

`app.use(Domain).command(writer)` requires a signed-in user, calls `writer.render()` to produce the unsigned template and its relay set, and wraps them in a `Command`. The signer, resolver, and repository are injected once when the kind is configured, so the writer's terminal methods take no arguments:

```typescript
await writer.renderTemplate()  // Promise<EventTemplate> — the unsigned event (validated, hints resolved)
await writer.scenario()    // Promise<RelayScenario> — chainable: .limit(n) / .policy(fn) / allow*
await writer.relays()      // Promise<string[]> — scenario().getUrls()
await writer.render()      // Promise<{event, relays}> — renderTemplate() + relays() together
```

When you need finer control than `Domain.command` gives — for example to raise the relay limit — resolve the pieces yourself and build the `Command` by hand. This is how `Deletes` fans a deletion out to every relay its target lives on:

```typescript
import {Delete} from "@welshman/domain"
import {Command} from "@welshman/app"

const writer = app.use(Domain).writer(Delete).addEvent(event, seenRelay)

const [template, scenario] = await Promise.all([writer.renderTemplate(), writer.scenario()])

// A delete should reach every relay its target lives on, so raise the limit
// above the scenario default before taking the urls.
return new Command(app, template, scenario.limit(30).getUrls())
```

### Forced relays

Some events must go to specific relays regardless of the outbox model — NIP-29 room ops, relay-management ops, and anything else that lives on one server. Writers express this with `forcedRelays`: when it's set, `scenario()` publishes **only** to those urls, bypassing the usual author-outbox / p-tag-inbox routing.

```typescript
// setRoom records the room’s relay AND writes the "h" tag (NIP-29):
app.use(Domain).writer(RoomJoin).setRoom(relayUrl, roomId)

// forceRelays pins the relay set without an "h" tag:
app.use(Domain).writer(Note).forceRelays("wss://relay.example").setContent("hi")
```

Kinds that require explicit relays (the NIP-29 room ops/state and relay-management ops/state) fail validation in `render()` unless `setRoom`/`forceRelays` has been called.

## Gift-wrapped messages

There are two ways to publish encrypted, NIP-59 gift-wrapped events. Both take a rumor template — for a NIP-17 message, build it with the [`DirectMessage`](../domain/content#directmessage-kind-14) kind:

```typescript
const rumorTemplate = await app
  .use(Domain)
  .writer(DirectMessage)
  .setContent("gm")
  .addRecipient(theirPubkey)
  .renderTemplate()
```

### A single thunk with a `recipient`

Set `recipient` on a normal thunk. The thunk wraps the rumor with an ephemeral key, registers it with the app's `WrapManager`, and publishes the wrap:

```typescript
app.use(Thunks).publish({
  event: rumorTemplate,
  relays: theirMessagingRelays,
  recipient: theirPubkey,
})
```

### Many recipients via `Wraps`

The `Wraps` plugin publishes one wrap per recipient, resolving each recipient's NIP-17 messaging relays automatically:

```typescript
const merged = await app.use(Wraps).publish({
  event: rumorTemplate,
  recipients: [pubkeyA, pubkeyB],
})

await merged.waitForCompletion()
```

`Wraps.publish` returns a `MergedThunk` aggregating the per-recipient thunks. Incoming wraps addressed to the current user are unwrapped automatically by the [`appPolicyWraps`](./apppolicies) default policy; wraps that fail to unwrap (or are duplicates) are skipped.

## Proof of work

Set `pow` to a target difficulty (number of leading zero bits). The thunk mines the PoW before signing; for wrapped events the wrap itself is mined.

```typescript
app.use(Thunks).publish({event, relays, pow: 20})
```
