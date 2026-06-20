# Content

A grab-bag of content kinds: NIP-22 comments, NIP-7D forum threads, NIP-99 classifieds, NIP-52 calendar events, NIP-88 polls, and NIP-56 reports. Each is a plain `EventReader` / `EventBuilder` pair — see [Readers & Builders](./readers-and-builders) for the base pattern. The parameterized-replaceable kinds (`Classified`, `TimeEvent`) need a `d` tag (`setIdentifier()`).

## Comment (kind 1111)

NIP-22 comments distinguish the **thread root** (uppercase `E`/`A`/`K`/`P` tags) from the **immediate parent** (lowercase `e`/`a`/`k`/`p`). Both are read as a `CommentRef` (`{id?, address?, kind?, pubkey?}`).

```typescript
import {Comment, CommentBuilder} from "@welshman/domain"
import type {CommentRef} from "@welshman/domain"

const comment = await Comment.fromEvent(event)
comment.root()     // CommentRef — uppercase tags (thread root)
comment.parent()   // CommentRef — lowercase tags (immediate parent)

// Set refs explicitly...
const template = await new CommentBuilder()
  .setContent("nice thread")
  .setRoot(rootKind, rootId, rootPubkey)
  .setParent(parentKind, parentId, parentPubkey)
  .toTemplate()

// ...or derive them from events (uses the event's d tag as identifier)
await new CommentBuilder()
  .setContent("reply")
  .setRootFromEvent(rootEvent)
  .setParentFromEvent(parentEvent)
  .toEvent(signer)
```

::: warning Identifier quirk
When you pass an `identifier` to `setRoot`/`setParent`, the builder pushes an `A`/`a` tag whose value is the `id` you passed — not a constructed `kind:pubkey:identifier` address. Be aware of this if you read those tags back expecting a full address.
:::

## Thread (kind 11)

A NIP-7D forum thread root. Just a title plus the body content.

```typescript
import {Thread, ThreadBuilder} from "@welshman/domain"

const thread = await Thread.fromEvent(event)
thread.title()     // "title" tag value

await new ThreadBuilder()
  .setTitle("Welcome")
  .setContent("Read the rules first.")
  .toEvent(signer)
```

## Classified (kind 30402)

A NIP-99 marketplace listing. The price parses into a `ClassifiedPrice` (`{amount, currency, frequency}`), defaulting currency to `SAT`.

```typescript
import {Classified, ClassifiedBuilder} from "@welshman/domain"
import type {ClassifiedPrice} from "@welshman/domain"

const listing = await Classified.fromEvent(event)
listing.title()     // "title" tag value
listing.summary()   // "summary" tag value
listing.price()     // ClassifiedPrice | undefined
listing.status()    // "status" tag value
listing.images()    // "image" tag values
listing.topics()    // t-tag values

await new ClassifiedBuilder()
  .setIdentifier()                       // required d tag for kind 30402
  .setTitle("Bike for sale")
  .setSummary("lightly used")
  .setPrice(150, "USD", "")              // amount, currency = "SAT", frequency = ""
  .setStatus("active")
  .setImages(["https://example.com/bike.jpg"])
  .setTopics(["bikes", "forsale"])
  .toEvent(signer)
```

## TimeEvent (kind 31923)

A NIP-52 time-based calendar event.

```typescript
import {TimeEvent, TimeEventBuilder} from "@welshman/domain"

const evt = await TimeEvent.fromEvent(event)
evt.title()      // "title" tag value
evt.location()   // "location" tag value
evt.start()      // unix seconds as int, or undefined
evt.end()        // unix seconds as int, or undefined

await new TimeEventBuilder()
  .setIdentifier()                       // required d tag for kind 31923
  .setTitle("Nostrica")
  .setLocation("Costa Rica")
  .setStart(startTs)
  .setEnd(endTs)
  .toEvent(signer)
```

When both `start` and `end` are set, `buildTags` auto-generates one `["D", dayIndex]` tag per day in `[start, end)` (day-bucket index tags), so the event is discoverable by day.

## Poll (kind 1068) and PollResponse (kind 1018)

NIP-88 polls. A `Poll` has a title (content), options, a type, and an optional close time. Types are exported as `PollType` (`"singlechoice" | "multiplechoice"`), options as `PollOption`, and tallies as `PollResult`.

```typescript
import {Poll, PollBuilder} from "@welshman/domain"
import type {PollType, PollOption, PollResult} from "@welshman/domain"

const poll = await Poll.fromEvent(event)
poll.title()        // event.content (or "")
poll.options()      // PollOption[] — {id, label}
poll.pollType()     // PollType, default "singlechoice"
poll.endsAt()       // unix seconds | undefined
poll.isClosed()     // boolean (endsAt <= now)
poll.urls()         // "relay" tag values

await new PollBuilder()
  .setTitle("Favorite client?")
  .addOption("Coracle")              // id defaults to a random id
  .addOption("Flotilla")
  .setPollType("singlechoice")
  .setEndsAt(closeTs)
  .toEvent(signer)
```

`validate()` requires at least one option. To tally votes, pass the response events to `results`:

```typescript
const result: PollResult = poll.results(responseEvents)
result.options   // [{id, label, votes}, …]
result.voters    // number of distinct voters
```

`results` keeps only each pubkey's latest response, takes the first selection for single-choice polls, and the unique selections for multiple-choice.

A `PollResponse` is one voter's answer:

```typescript
import {PollResponse, PollResponseBuilder} from "@welshman/domain"

const response = await PollResponse.fromEvent(event)
response.pollId()       // e-tag value
response.selections()   // unique "response" tag values

await new PollResponseBuilder()
  .setPollId(pollId)
  .addSelection(optionId)     // deduped
  .toEvent(signer)
```

`PollResponse.validate()` requires a pollId.

## Report (kind 1984)

A NIP-56 report flags a pubkey and/or an event with a reason.

```typescript
import {Report, ReportBuilder} from "@welshman/domain"

const report = await Report.fromEvent(event)
report.reportedPubkey()   // p-tag value
report.eventId()          // e-tag value (tag[1])
report.reason()           // e-tag reason (tag[2])

await new ReportBuilder()
  .setReportedPubkey(pubkey)
  .setEventId(noteId)
  .setReason("spam")
  .toEvent(signer)
```

`buildTags` emits `["p", pubkey]` and `["e", id, reason?]`.

## See also

- [Readers & Builders](./readers-and-builders) — the base `EventReader`/`EventBuilder` pattern, including `d`-tag validation for `Classified` and `TimeEvent`.
