# Publishing Events

Publishing in `@welshman/app` is **optimistic**. The event goes into the local repository immediately, so the UI updates before any relay answers. It then passes through an optional soft-undo delay, NIP-59 gift-wrapping, NIP-13 proof-of-work, signing, and sending. Each call to `publish` returns a `Publication`, whose state names its current stage and, once it is sending, each relay's answer.

Publishing is managed by the `Publisher` plugin: `app.use(Publisher)`.

## Publishing to specific relays

```typescript
import {makeEvent, NOTE} from "@welshman/util"

const publication = app.use(Publisher).publish({
  event: makeEvent(NOTE, {content: "hi"}),
  relays: ["wss://relay.example"],
})
```

## Publishing to the outbox

`Publisher` has no outbox helper. Resolve the current user's write relays with the [Router](./routing) and pass them to `publish`, as [`Command.publish()`](#commands) does for every data-plugin mutation.

```typescript
import {userOutbox} from "@welshman/util"

const scenario = await app.use(Router).resolve([userOutbox()])

const publication = app.use(Publisher).publish({
  event: makeEvent(NOTE, {content: "hi"}),
  relays: scenario.getUrls(),
  delay: 3000,            // wait 3s before signing and sending; abort to undo
})
```

## `PublishRequest`

```typescript
type PublishRequest = {
  event: EventTemplate    // stamped and hashed when publish is called
  relays: string[]
  recipient?: string      // present → NIP-59 gift-wrap to this pubkey
  delay?: number          // ms to wait before signing/sending (soft-undo)
  pow?: number            // NIP-13 proof-of-work difficulty
  priority?: number
  timeout?: number        // ms to wait for each relay's OK
}
```

## The pipeline

A publication moves through `PublicationState`, a union keyed by `stage`:

| Stage | When |
| --- | --- |
| `queued` | Waiting for the publisher's queue, which paces how fast publications start |
| `delayed` | Inside the `delay` window; `until` is when it ends (seconds) |
| `wrapping` | Sealing and wrapping for `recipient`; the user's signer signs the seal here |
| `pow` | Mining to `difficulty`, on the wrap if there is one |
| `signing` | Waiting on the user's signer |
| `sending` | Waiting on relays; `results` fills in as each one answers |
| `sent` | Every relay has answered or timed out |
| `failed` | A stage threw (e.g. the signer refused); `error` says why |
| `aborted` | `abort()` was called before the publication settled |

Stages that don't apply are skipped. `sent`, `failed` and `aborted` are terminal. A publication in a terminal state never changes again, so `abort()` does nothing after it settles. Every terminal state has a result for each relay, because `failed` and `aborted` fill in the missing ones, so the URL helpers below work the same however a publication ended.

## Working with a publication

A publication is a Svelte store that notifies subscribers on every state change. Once it settles it never changes again, so a later subscriber is called once and not kept.

```typescript
const publication = app.use(Publisher).publish({event, relays})

publication.subscribe(p => console.log(p.state.stage, p.results))

publication.abort()                 // soft-undo; unwinds the optimistic write
publication.canAbort()              // nothing has reached a relay yet, so an abort still undoes it

publication.getCompleteUrls()
publication.getIncompleteUrls()     // relays still pending, or not sent to yet
publication.getFailedUrls()         // rejected or timed out
publication.isComplete()            // reached a terminal stage
publication.getError()              // first relay's rejection or the pipeline's error, or undefined

await publication.settled()         // resolves once it reaches a terminal stage
```

`publication.event` starts as the stamped and hashed event, and the mined and signed versions replace it as they arrive. For a gift wrap, `publication.event` is the rumor and `publication.wrap` is what relays receive. `publication.request` holds the arguments passed to `publish`.

## History and retries

```typescript
const publisher = app.use(Publisher)

publisher.history                   // writable<Publication[]> — the optimistic publish log
publisher.retry(publication)        // re-send a publication or group
publisher.retry(publication, [url]) // re-send only to these of its relays, e.g. one that failed
publisher.merge([a, b])             // watch several as one PublicationGroup
```

With a relay subset, a group retries only the publications that sent to one of those relays, and each only to the relays it shares with the subset. A retry re-sends `publication.event` with the same id, so a relay that accepted the first attempt receives the same event rather than a new one. The publications a retry replaces leave `history`, so a view that merges an event's publications sees the retry's outcome rather than the failure it replaced.

## Groups

A `PublicationGroup` has the same status helpers as a publication, plus `publications`. When several publications go to the same relay, the group reports that relay as pending while any of them is pending, and otherwise as the worst outcome among them.

## Repository bookkeeping

`publish` writes the event to the repository and tracker, so derived stores reflect it before any relay responds. The publisher keeps both in step with the publication:

- A signature on the same id replaces the unsigned copy in place, so the repository reports no removal. Proof of work changes the id, so the publisher removes the optimistic event and adds the mined one.
- The publisher removes a relay from the tracker when the relay rejects the event, times out, or is aborted.
- The publisher registers a gift wrap with the app's `WrapManager` when the wrap is sent.
- The publisher removes an aborted publication's event and wrap from the repository and drops its history entry. A failed publication keeps its event so it can be retried.

## Commands

The [data plugins](./data)' mutation methods (`follow`, `update`, `addRelay`, `setRelays`, `Rooms.create`/`edit`/etc.) don't publish directly — they build the event and the relays it belongs on, and return a `Command` for the caller to decide how (or whether) to publish it.

```typescript
import type {Command} from "@welshman/app"

const command: Command = await app.use(FollowLists).follow(["p", otherPubkey])

command.app       // the IApp it was built for
command.event      // EventTemplate — unsigned, inspectable before publishing
command.relays     // string[] — where publish() will send it

command.publish()             // the normal path: app.use(Publisher).publish({event, relays})
command.publishToRelays(urls)  // same, but override the relay set
```

Since mutation methods are themselves `async`, calling `.publish()` on the result normally means a double `await`. `publish` and `publishToRelays` are also exported as free functions so you can chain them onto the outer promise instead:

```typescript
import {publish, publishToRelays} from "@welshman/app"

await app.use(FollowLists).follow(["p", otherPubkey]).then(publish)
await app.use(Rooms).leave(relayUrl, roomMeta).then(publish)
await app.use(Rooms).join(relayUrl, roomMeta).then(publishToRelays([relayUrl]))
```

`Wraps.publish` is the one mutation that still publishes directly rather than returning a `Command`: it fans a single rumor out into a `PublicationGroup` of per-recipient wraps, each with its own relay set, which doesn't fit the one-event/one-relay-set shape a `Command` assumes.

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

### Forced routes

Some events must go to specific relays regardless of the outbox model — NIP-29 room ops, relay-management ops, and anything else that lives on one server. Writers express this with `forcedRoutes`: when it's set, `scenario()` publishes **only** there, bypassing the usual author-outbox / p-tag-inbox routing.

```typescript
// setRoom records the room’s relay AND writes the "h" tag (NIP-29):
app.use(Domain).writer(RoomJoin).setRoom(relayUrl, roomId)

// forceRoutes pins the target without an "h" tag — a literal relay, or any route:
app.use(Domain).writer(Note).forceRoutes(relay("wss://relay.example")).setContent("hi")
```

Kinds that require explicit relays (the NIP-29 room ops/state and relay-management ops/state) fail validation in `render()` unless `setRoom`/`forceRoutes` has been called.

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

### A single publication with a `recipient`

Set `recipient` on a normal publication. The publisher wraps the rumor with an ephemeral key, registers it with the app's `WrapManager`, and publishes the wrap:

```typescript
app.use(Publisher).publish({
  event: rumorTemplate,
  relays: theirMessagingRelays,
  recipient: theirPubkey,
})
```

### Many recipients via `Wraps`

The `Wraps` plugin publishes one wrap per recipient, resolving each recipient's NIP-17 messaging relays automatically:

```typescript
const group = await app.use(Wraps).publish({
  event: rumorTemplate,
  recipients: [pubkeyA, pubkeyB],
})

await group.settled()
```

`Wraps.publish` returns a `PublicationGroup` of the per-recipient publications. Incoming wraps addressed to the current user are unwrapped automatically by the [`appPolicyWraps`](./apppolicies) default policy; wraps that fail to unwrap (or are duplicates) are skipped.

## Proof of work

Set `pow` to a target difficulty (number of leading zero bits). The publication mines the PoW before signing; for wrapped events the wrap itself is mined. An event that arrives already signed is sent as it is.

```typescript
app.use(Publisher).publish({event, relays, pow: 20})
```
