# Publishing Events

Publishing in `@welshman/app` is **optimistic**. The event goes into the local repository immediately, so the UI updates before any relay answers. It then passes through an optional soft-undo delay, NIP-59 gift-wrapping, NIP-13 proof-of-work, signing, and sending. Each call to `publish` returns a `Publication`, whose state names its current stage and, once it is sending, each relay's answer.

The `Publisher` plugin, `app.use(Publisher)`, runs the pipeline.

## Publishing to specific relays

```typescript
import {makeEvent, NOTE} from "@welshman/util"

const publication = app.use(Publisher).publish({
  event: makeEvent(NOTE, {content: "hi"}),
  relays: ["wss://relay.example"],
})
```

## Publishing to the outbox

`Publisher` takes explicit relays. The current user's write relays come from the [Router](./routing):

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

Stages that don't apply are skipped. `sent`, `failed` and `aborted` are terminal, and a publication in a terminal state never changes again, so `abort()` does nothing after it settles. `failed` and `aborted` fill in a result for every relay that lacks one, so the URL helpers below work the same however a publication ended.

## Working with a publication

A publication is a Svelte store that notifies subscribers on every state change. A subscriber added after it settles is called once and not kept.

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

The [data plugins](./data)' mutation methods (`follow`, `update`, `addWriteUrl`, `Rooms.createRoom`, …) don't publish. They build the event and the relays it belongs on, and return a `Command` for the caller to publish or drop.

```typescript
import type {Command} from "@welshman/app"

const command: Command = await app.use(FollowLists).follow(["p", otherPubkey])

command.app       // the IApp it was built for
command.event     // EventTemplate, unsigned
command.relays    // string[], where publish() sends it

command.publish()              // app.use(Publisher).publish({event, relays})
command.publishToRelays(urls)  // the same, to a different relay set
```

Mutation methods are `async`, so `publish` and `publishToRelays` are also exported as free functions that chain onto the outer promise:

```typescript
import {publish, publishToRelays} from "@welshman/app"

await app.use(FollowLists).follow(["p", otherPubkey]).then(publish)
await app.use(Rooms).leaveRoom(relayUrl, roomMeta).then(publish)
await app.use(Rooms).joinRoom(relayUrl, roomMeta).then(publishToRelays([relayUrl]))
```

`Wraps.publish` publishes directly instead of returning a `Command`, because it fans one rumor out into per-recipient wraps, each with its own relay set.

### Building a command from a domain writer

Every mutation method builds its event with a [`@welshman/domain`](../domain/) writer and passes it to [`app.use(Domain).command(writer)`](./plugins#the-domain-plugin), which is also available directly:

```typescript
import {FollowList} from "@welshman/domain"
import {Domain, User} from "@welshman/app"

const reader = await app.use(FollowLists).forceLoad(User.require(app).pubkey)
const writer = app.use(Domain).writer(FollowList, reader).follow(otherPubkey)

const command = await app.use(Domain).command(writer)
```

A publish resolves up to 30 relays, where a read resolves three, so nothing has to lift the limit to reach a user's whole write set. To tune the scenario further, render the pieces and build the `Command` by hand:

```typescript
import {addMinimalFallbacks} from "@welshman/util"
import {Delete} from "@welshman/domain"
import {Command} from "@welshman/app"

const writer = app.use(Domain).writer(Delete).addEvent(event, seenRelay)
const [template, scenario] = await Promise.all([writer.renderTemplate(), writer.scenario()])

const command = new Command(app, template, scenario.policy(addMinimalFallbacks).getUrls())
```

Events that belong on one relay, such as NIP-29 room ops, set [forced routes](./routing#forced-routes) on the writer.

## Gift-wrapped messages

There are two ways to publish NIP-59 gift-wrapped events. Both take a rumor template, which for a NIP-17 message comes from the [`DirectMessage`](../domain/content#directmessage-kind-14) kind:

```typescript
const rumorTemplate = await app
  .use(Domain)
  .writer(DirectMessage)
  .setContent("gm")
  .addRecipient(theirPubkey)
  .renderTemplate()
```

### A single publication with a `recipient`

With `recipient` set, the publisher wraps the rumor with an ephemeral key, registers it with the app's `WrapManager`, and publishes the wrap:

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

`Wraps.publish` returns a `PublicationGroup` of the per-recipient publications. The [`appPolicyWraps`](./app#default-policies) default policy unwraps incoming wraps addressed to the current user and skips duplicates. A wrap that fails to unwrap is retried with backoff up to `MAX_UNWRAP_ATTEMPTS` times.

## Proof of work

`pow` is a target difficulty in leading zero bits. The publication mines before signing, and mines the wrap for a wrapped event. An event that arrives already signed is sent as it is.

```typescript
app.use(Publisher).publish({event, relays, pow: 20})
```
