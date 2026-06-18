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

`publishToOutbox` resolves the current user's write relays (via the [Router](./routing)) for you — the usual way to publish your own notes.

```typescript
const thunk = app.use(Thunks).publishToOutbox({
  event: makeEvent(NOTE, {content: "hi"}),
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

`publish`/`publishToOutbox` accept these options minus `app` (and minus `relays` for `publishToOutbox`).

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

## Gift-wrapped messages

There are two ways to publish encrypted, NIP-59 gift-wrapped events.

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
