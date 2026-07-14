# Content

A grab-bag of content kinds: NIP-01 notes, NIP-22 comments, NIP-7D forum threads, NIP-99 classifieds, NIP-52 calendar events, NIP-88 polls, NIP-56 reports, and the pinboard system. Each is a plain `EventReader` / `EventWriter` pair — see [Readers & Writers](./readers-and-builders) for the base pattern. The parameterized-replaceable kinds (`Classified`, `TimeEvent`, `Pinboard`, `Pin`) need a `d` tag (`setIdentifier()`).

Every example below assumes a bound `KindContext` — you get a reader/writer by calling `SomeKind.configure(context)`. A reader is parsed asynchronously (`await …reader(event)`); a writer is a chainable builder whose terminal `render()` returns an unsigned `EventTemplate`. To turn that into a signed event, hand it to a signer:

```typescript
import {stamp} from "@welshman/util"

const signed = await signer.sign(stamp(await writer.render()))
```

In `@welshman/app` you never call `configure` yourself — `app.use(Domain).reader(Kind)` / `.writer(Kind, reader?)` do it for you, and `app.use(Domain).command(writer)` finalizes and wraps the result in a publishable `Command`. See [Readers & Writers](./readers-and-builders#with-welshmanapp-domain--command).

Unless a kind says otherwise, writers route to the **author's outbox plus every p-tagged pubkey's inbox** — the default `EventWriter.routes()`. Notes and comments use that default; `Report` overrides it (see below).

## Note (kind 1)

A NIP-01 short text note. The reader adds nothing beyond the base getters; the writer adds NIP-10 reply threading.

```typescript
import {Note} from "@welshman/domain"

const note = await Note.configure(context).reader(event)
note.content()   // event.content
note.author()    // event.pubkey

// A fresh note...
const template = await Note.configure(context)
  .writer()
  .setContent("gm")
  .render()

// ...or a reply — setParent(parentEvent) p-tags the parent's participants and
// e/a-tags the parent (and thread root) with NIP-10 markers and relay hints.
await Note.configure(context)
  .writer()
  .setContent("well said")
  .setParent(parentEvent)
  .render()
```

A note routes to the author's outbox plus the inboxes of everyone it p-tags (the default `routes()`), so replies reach the people they mention.

## Comment (kind 1111)

NIP-22 comments distinguish the **thread root** (uppercase `E`/`A`/`K`/`P` tags) from the **immediate parent** (lowercase `e`/`a`/`k`/`p`). Both are read as a `CommentRef` (`{id?, address?, kind?, pubkey?}`).

```typescript
import {Comment} from "@welshman/domain"
import type {CommentRef} from "@welshman/domain"

const comment = await Comment.configure(context).reader(event)
comment.root()     // CommentRef — uppercase tags (thread root)
comment.parent()   // CommentRef — lowercase tags (immediate parent)

// Set refs explicitly...
const template = await Comment.configure(context)
  .writer()
  .setContent("nice thread")
  .setRoot(rootKind, rootId, rootPubkey)
  .setParent(parentKind, parentId, parentPubkey)
  .render()

// ...or derive them from events (uses the event's d tag as identifier)
await Comment.configure(context)
  .writer()
  .setContent("reply")
  .setRootFromEvent(rootEvent)
  .setParentFromEvent(parentEvent)
  .render()
```

`setRoot`/`setParent` take an optional trailing `identifier`; when present, the writer also emits an `A`/`a` tag whose value is the full `kind:pubkey:identifier` address (built via `Address`). `setRootFromEvent`/`setParentFromEvent` pull that identifier from the source event's `d` tag automatically.

## Thread (kind 11)

A NIP-7D forum thread root. Just a title plus the body content.

```typescript
import {Thread} from "@welshman/domain"

const thread = await Thread.configure(context).reader(event)
thread.title()     // "title" tag value

await Thread.configure(context)
  .writer()
  .setTitle("Welcome")
  .setContent("Read the rules first.")
  .render()
```

## Classified (kind 30402)

A NIP-99 marketplace listing. The price parses into a `ClassifiedPrice` (`{amount, currency, frequency}`), defaulting currency to `SAT`.

```typescript
import {Classified} from "@welshman/domain"
import type {ClassifiedPrice} from "@welshman/domain"

const listing = await Classified.configure(context).reader(event)
listing.title()     // "title" tag value
listing.summary()   // "summary" tag value
listing.price()     // ClassifiedPrice | undefined
listing.status()    // "status" tag value
listing.images()    // "image" tag values
listing.topics()    // t-tag values

await Classified.configure(context)
  .writer()
  .setIdentifier()                       // required d tag for kind 30402
  .setTitle("Bike for sale")
  .setSummary("lightly used")
  .setPrice(150, "USD", "")              // amount, currency = "SAT", frequency = ""
  .setStatus("active")
  .setImages(["https://example.com/bike.jpg"])
  .setTopics(["bikes", "forsale"])
  .render()
```

## Pinboard (kind 30067) and Pin (kind 39067)

A pinboard system (Pinboards NIP) that separates board metadata from the individual pins. A `Pinboard` is an addressable board (`d` + `title`, with optional `description`/`image`/`t` hashtags and a presence-only `collaborative` flag). Pins are separate `Pin` events, each referencing **one** item plus zero or more boards.

```typescript
import {Pinboard} from "@welshman/domain"

const board = await Pinboard.configure(context).reader(event)
board.title()           // "title" tag value
board.description()     // "description" tag value
board.image()           // "image" tag value
board.topics()          // t-tag values
board.collaborative()   // boolean — presence of the "collaborative" tag

await Pinboard.configure(context)
  .writer()
  .setIdentifier("japan-trip-2024")      // required d tag for kind 30067
  .setTitle("Japan Trip 2024")           // required
  .setDescription("Photos and memories")
  .setImage("https://example.com/mt-fuji.jpg")
  .setTopics(["japan", "travel"])
  .setCollaborative(true)
  .render()
```

A `Pin` references exactly one item — a nostr event (`e`), an addressable event (`a`), or an external id (`i` + optional `k` per NIP-73) — exposed as a discriminated `PinReference`. It can belong to multiple boards via `A` tags; a pin with none is a profile pin. Its `content` is an optional comment. Kind 39067 sits in the parameterized-replaceable range, so each pin needs its own unique `d` tag (`setIdentifier()`) — otherwise every pin from the same author would collide at the same address and replace one another; `validate()` enforces this the same way it does for `Classified`/`TimeEvent`/`Pinboard`.

```typescript
import {Pin} from "@welshman/domain"

const pin = await Pin.configure(context).reader(event)
pin.boards()         // "A" tag values (board coordinates)
pin.isProfilePin()   // true when there are no boards
pin.reference()      // {type: "event"|"address"|"external", ...} | undefined
pin.title()          // custom pin "title" tag value
pin.topics()         // t-tag values

await Pin.configure(context)
  .writer()
  .setIdentifier()                                       // required d tag for kind 39067
  .addBoard("30067:" + pubkey + ":japan-trip-2024")
  .setEvent(pictureEventId, "wss://relay.example.com")   // or setAddress / setExternal
  .setContent("Sunrise at Mt. Fuji")
  .render()
```

`setEvent`/`setAddress`/`setExternal` each replace any prior reference, keeping the "exactly one" invariant. `validate()` throws if none of `e`/`a`/`i` is present.

## TimeEvent (kind 31923)

A NIP-52 time-based calendar event.

```typescript
import {TimeEvent} from "@welshman/domain"

const evt = await TimeEvent.configure(context).reader(event)
evt.title()      // "title" tag value
evt.location()   // "location" tag value
evt.start()      // unix seconds as int, or undefined
evt.end()        // unix seconds as int, or undefined

await TimeEvent.configure(context)
  .writer()
  .setIdentifier()                       // required d tag for kind 31923
  .setTitle("Nostrica")
  .setLocation("Costa Rica")
  .setStart(startTs)
  .setEnd(endTs)
  .render()
```

When both `start` and `end` are set, `buildTags` auto-generates one `["D", dayIndex]` tag per day in `[start, end)` (day-bucket index tags), so the event is discoverable by day.

## Poll (kind 1068) and PollResponse (kind 1018)

NIP-88 polls. A `Poll` has a title (content), options, a type, and an optional close time. Types are exported as `PollType` (`"singlechoice" | "multiplechoice"`), options as `PollOption`, and tallies as `PollResult`.

```typescript
import {Poll} from "@welshman/domain"
import type {PollType, PollOption, PollResult} from "@welshman/domain"

const poll = await Poll.configure(context).reader(event)
poll.title()        // event.content (or "")
poll.options()      // PollOption[] — {id, label}
poll.pollType()     // PollType, default "singlechoice"
poll.endsAt()       // unix seconds | undefined
poll.isClosed()     // boolean (endsAt <= now)
poll.urls()         // "relay" tag values

await Poll.configure(context)
  .writer()
  .setTitle("Favorite client?")
  .addOption("Coracle")              // id defaults to a random id
  .addOption("Flotilla")
  .setPollType("singlechoice")
  .setEndsAt(closeTs)
  .render()
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
import {PollResponse} from "@welshman/domain"

const response = await PollResponse.configure(context).reader(event)
response.pollId()       // e-tag value
response.selections()   // unique "response" tag values

await PollResponse.configure(context)
  .writer()
  .setPollId(pollId)
  .addSelection(optionId)     // deduped
  .render()
```

`PollResponse.validate()` requires a pollId.

## Report (kind 1984)

A NIP-56 report flags a pubkey and/or an event with a reason.

```typescript
import {Report} from "@welshman/domain"

const report = await Report.configure(context).reader(event)
report.pubkey()    // p-tag value
report.eventId()   // e-tag value (tag[1])
report.reason()    // reason from the e-tag or p-tag (tag[2])

await Report.configure(context)
  .writer()
  .setPubkey(pubkey)
  .setEventId(noteId)
  .setReason("spam")
  .render()
```

A report's reason lives on both the `p` and `e` tags; the writer normalizes it so a reason set on either (or via `setReason`) is reflected on both. Unlike most content kinds, `ReportWriter` overrides `routes()` to `[userOutbox()]` — a report's `p`/`e` tags identify what is being flagged, not recipients to notify, so it publishes only to the author's own outbox.

## SlashCommand (kind 33318)

An addressable manifest that defines a slash command (its `d` tag is the command name). `k` tags declare which event kinds the command monitors; `h` tags declare which NIP-29 groups (none means it can be invoked anywhere). Each `param` tag declares a parameter (`label`, a type hint — `string`/`number`/`pubkey`/`topic`/`relay` — and an optional `optional` flag); `options` tags supply custom auto-complete values for a param.

```typescript
import {SlashCommand} from "@welshman/domain"

const command = await SlashCommand.configure(context).reader(event)
command.name()                 // d tag — the command name
command.description()          // content
command.kinds()                // monitored event kinds (k tags), as numbers
command.groups()               // monitored NIP-29 groups (h tags)
command.params()               // SlashCommandParam[] — {label, type, optional}
command.options("model")       // custom options for the "model" param
command.appliesTo(kind, group) // should it be surfaced in this context?

await SlashCommand.configure(context)
  .writer()
  .setName("generate") // required d tag for kind 33318
  .setDescription("A command that generates images using an LLM.")
  .setKinds([1, 9])
  .addGroup("98d9s")
  .addParam("model")
  .addParam("style", "string", true) // optional
  .addOption("model", "Nano Banana Pro")
  .render()
```

A command is invoked by putting a `/name <arg> <arg>` string (arguments wrapped in angle brackets) into an event of one of the monitored kinds, p-tagging the manifest's author. Two free functions handle the invocation string:

```typescript
import {parseSlashCommand, formatSlashCommand} from "@welshman/domain"

parseSlashCommand("/generate <Nano Banana Pro> <a turtle>")
// => {name: "generate", args: ["Nano Banana Pro", "a turtle"]}

formatSlashCommand("generate", ["Nano Banana Pro", "a turtle"])
// => "/generate <Nano Banana Pro> <a turtle>"
```

In `@welshman/app`, the `SlashCommands` plugin loads manifests reactively (`forContext(kind, group)` surfaces only the commands valid in a context) and `invoke(command, args, {kind, group})` publishes an invocation.

## See also

- [Readers & Writers](./readers-and-builders) — the base `EventReader`/`EventWriter` pattern, the `configure` entry point, default routing, and `d`-tag validation for `Classified` and `TimeEvent`.
