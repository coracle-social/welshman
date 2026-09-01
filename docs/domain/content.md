# Content

A grab-bag of content kinds: NIP-01 notes, NIP-17 direct messages, NIP-22 comments, NIP-7D forum threads, NIP-99 classifieds, NIP-84 highlights, NIP-52 calendar events, NIP-88 polls, NIP-56 reports, and the pinboard system. Each is a plain `EventReader` / `EventWriter` pair — see [Readers & Writers](./readers-and-writers) for the base pattern. The parameterized-replaceable kinds (`Classified`, `TimeEvent`, `Pinboard`, `Pin`) need a `d` tag (`setIdentifier()`).

Every example below assumes a bound `KindContext` — you get a reader/writer by calling `SomeKind.configure(context)`. A reader is built and then parsed (`…reader(event).parse()`); none of the kinds on this page decrypt, so nothing here needs awaiting. A writer is a chainable builder whose terminal `renderTemplate()` returns an unsigned `EventTemplate`. To turn that into a signed event, hand it to a signer:

```typescript
import {stamp} from "@welshman/util"

const signed = await signer.sign(stamp(await writer.renderTemplate()))
```

In `@welshman/app` you never call `configure` yourself — `app.use(Domain).reader(Kind)` / `.writer(Kind, reader?)` do it for you, and `app.use(Domain).command(writer)` finalizes and wraps the result in a publishable `Command`. See [Readers & Writers](./readers-and-writers#with-welshmanapp-domain--command).

Unless a kind says otherwise, writers route to the **author's outbox plus every p-tagged pubkey's inbox** — the default `EventWriter.renderRoutes()`. Notes and comments use that default; `DirectMessage` and `Report` override it (see below).

## Note (kind 1)

A NIP-01 short text note. The reader adds nothing beyond the base getters; the writer adds NIP-10 reply threading.

```typescript
import {Note} from "@welshman/domain"

const note = Note.configure(context).reader(event).parse()
note.content()   // event.content
note.author()    // event.pubkey

// A fresh note...
const template = await Note.configure(context)
  .writer()
  .setContent("gm")
  .renderTemplate()

// ...or a reply — setParent(parentEvent) p-tags the parent's participants and
// e/a-tags the parent (and thread root) with NIP-10 markers and relay hints.
await Note.configure(context)
  .writer()
  .setContent("well said")
  .setParent(parentEvent)
  .renderTemplate()
```

A note routes to the author's outbox plus the inboxes of everyone it p-tags (the default `renderRoutes()`), so replies reach the people they mention.

## DirectMessage (kind 14)

A NIP-17 direct message. It is never signed or published on its own — it stays a rumor, gift-wrapped once per recipient (see [gift-wrapped messages](../app/publishing#gift-wrapped-messages)).

```typescript
import {DirectMessage} from "@welshman/domain"

const message = DirectMessage.configure(context).reader(event).parse()
message.recipients()   // p-tag pubkeys
message.subject()      // "subject" tag value
message.parentId()     // e-tag value, present when the message is a reply

const template = await DirectMessage.configure(context)
  .writer()
  .setContent("gm")
  .addRecipient(theirPubkey)
  .setSubject("welshman")
  .setParent(theirMessage)
  .renderTemplate()
```

`addRecipient`/`removeRecipient` manage the `p` tags, hinting at the recipient's NIP-17 relays rather than their outbox. `setParent` replaces any existing `e` tag, so a message replies to exactly one other. Rendering throws unless there is at least one recipient.

`DirectMessageWriter` routes to the messaging relays of the author and every recipient, since a wrap goes to NIP-17 inboxes rather than through the outbox model. `Wraps` resolves those relays per recipient itself, so the writer's routing only comes into play when you publish a wrap by hand.

## Comment (kind 1111)

NIP-22 comments distinguish the **thread root** (uppercase `E`/`A`/`K`/`P` tags) from the **immediate parent** (lowercase `e`/`a`/`k`/`p`). Both are read as a `CommentRef` (`{id?, address?, kind?, pubkey?}`).

```typescript
import {Comment} from "@welshman/domain"
import type {CommentRef} from "@welshman/domain"

const comment = Comment.configure(context).reader(event).parse()
comment.root()     // CommentRef — uppercase tags (thread root)
comment.parent()   // CommentRef — lowercase tags (immediate parent)

// Set refs explicitly...
const template = await Comment.configure(context)
  .writer()
  .setContent("nice thread")
  .setRoot(rootKind, rootId, rootPubkey)
  .setParent(parentKind, parentId, parentPubkey)
  .renderTemplate()

// ...or derive them from events (uses the event's d tag as identifier)
await Comment.configure(context)
  .writer()
  .setContent("reply")
  .setRootFromEvent(rootEvent)
  .setParentFromEvent(parentEvent)
  .renderTemplate()
```

`setRoot`/`setParent` take an optional trailing `identifier`; when present, the writer also emits an `A`/`a` tag whose value is the full `kind:pubkey:identifier` address (built via `Address`). `setRootFromEvent`/`setParentFromEvent` pull that identifier from the source event's `d` tag automatically.

## Thread (kind 11)

A NIP-7D forum thread root. Just a title plus the body content.

```typescript
import {Thread} from "@welshman/domain"

const thread = Thread.configure(context).reader(event).parse()
thread.title()     // "title" tag value

await Thread.configure(context)
  .writer()
  .setTitle("Welcome")
  .setContent("Read the rules first.")
  .renderTemplate()
```

## Classified (kind 30402)

A NIP-99 marketplace listing. The price parses into a `ClassifiedPrice` (`{amount, currency, frequency}`), defaulting currency to `SAT`.

```typescript
import {Classified} from "@welshman/domain"
import type {ClassifiedPrice} from "@welshman/domain"

const listing = Classified.configure(context).reader(event).parse()
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
  .renderTemplate()
```

## Pinboard (kind 30067) and Pin (kind 39067)

A pinboard system (Pinboards NIP) that separates board metadata from the individual pins. A `Pinboard` is an addressable board (`d` + `title`, with optional `description`/`image`/`t` hashtags and a presence-only `collaborative` flag). Pins are separate `Pin` events, each referencing **one** item plus zero or more boards.

```typescript
import {Pinboard} from "@welshman/domain"

const board = Pinboard.configure(context).reader(event).parse()
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
  .renderTemplate()
```

A `Pin` references exactly one item — a nostr event (`e`), an addressable event (`a`), or an external id (`i` + optional `k` per NIP-73) — exposed as a discriminated `PinReference`. It can belong to multiple boards via `A` tags; a pin with none is a profile pin. Its `content` is an optional comment. Kind 39067 sits in the parameterized-replaceable range, so each pin needs its own unique `d` tag (`setIdentifier()`) — otherwise every pin from the same author would collide at the same address and replace one another; `validate()` enforces this the same way it does for `Classified`/`TimeEvent`/`Pinboard`.

```typescript
import {Pin} from "@welshman/domain"

const pin = Pin.configure(context).reader(event).parse()
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
  .renderTemplate()
```

`setEvent`/`setAddress`/`setExternal` each replace any prior reference, keeping the "exactly one" invariant. `validate()` throws if none of `e`/`a`/`i` is present.

## Highlight (kind 9802)

A NIP-84 highlight. The `content` is the highlighted excerpt, which may be empty when the source is non-text media. A `comment` tag turns the highlight into a **quote highlight**, rendered like a quote repost. In that case a `p` tag marked `mention` is named in the comment rather than credited for the source, and the same marker on an `r` tag means the reference came from the comment.

```typescript
import {Highlight} from "@welshman/domain"
import type {HighlightSource, HighlightAttribution} from "@welshman/domain"

const highlight = Highlight.configure(context).reader(event).parse()
highlight.content()         // the highlighted excerpt
highlight.sources()         // HighlightSource[] — where it was taken from
highlight.attributions()    // HighlightAttribution[] — authors/editors of the source
highlight.mentions()        // pubkeys named in the comment
highlight.sourceContext()   // "context" tag — text surrounding the excerpt
highlight.comment()         // "comment" tag value
highlight.references()      // r-tag values marked "mention"
highlight.topics()          // t-tag values
```

A `HighlightSource` is a discriminated union over the four ways NIP-84 tags a source: `{type: "event", id, relay}` (`e`), `{type: "address", address, relay}` (`a`), `{type: "external", id}` (NIP-73 `i`), and `{type: "reference", value}` (`r`, a url or plain text). A missing relay hint reads as `""` rather than `undefined`; `i` and `r` tags have no hint slot at all. `sources()` returns a list because a highlight of a replaceable event carries both an `e` and an `a` tag. A `HighlightAttribution` is `{pubkey, relay, role?}`, where `role` is NIP-84's `author` or `editor` and is absent on the unmarked `p` tags older clients write. The `context` tag is read as `sourceContext()`, since `context` is the reader's own `KindContext`.

```typescript
await Highlight.configure(context)
  .writer()
  .setContent("the highlighted bit")
  .setSourceEvent(sourceEvent)        // or setSourceReference / setSourceExternal
  .setSourceContext("the surrounding paragraph")
  .addAttribution(editorPubkey, "editor")
  .setTopics(["nostr"])
  .renderTemplate()

// A quote highlight — the comment's refs are marked so they aren't read as the source.
await Highlight.configure(context)
  .writer()
  .setContent("the highlighted bit")
  .setSourceReference("https://example.com/essay")
  .setComment("worth reading")
  .addMention(somePubkey)
  .addTags(["r", "https://example.com/related", "mention"])
  .renderTemplate()
```

`setSourceEvent` credits the source's author with a `p` tag, and tags a replaceable source both ways (`e` and `a`) so the highlight survives an edit of the source. That attribution also routes the highlight to the credited author's inbox, under the default routing. Each `setSource*` replaces any prior source, leaving comment references alone.

`addAttribution` keeps one `p` tag per pubkey, so re-attributing someone changes their role instead of crediting them twice, and `removeAttribution` drops that pubkey's tag whatever its role. `addMention` is `addAttribution(pubkey, "mention")`, which overrides the base writer's unmarked mention. There is no setter for a comment's `r` tags — add them with `addTags(["r", value, "mention"])`. NIP-84 only says a highlight *should* tag its source, so `validate()` doesn't require one.

## TimeEvent (kind 31923)

A NIP-52 time-based calendar event.

```typescript
import {TimeEvent} from "@welshman/domain"

const evt = TimeEvent.configure(context).reader(event).parse()
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
  .renderTemplate()
```

When both `start` and `end` are set, `buildTags` auto-generates one `["D", dayIndex]` tag per day in `[start, end)` (day-bucket index tags), so the event is discoverable by day.

## Poll (kind 1068) and PollResponse (kind 1018)

NIP-88 polls. A `Poll` has a title (content), options, a type, and an optional close time. Types are exported as `PollType` (`"singlechoice" | "multiplechoice"`), options as `PollOption`, and tallies as `PollResult`.

```typescript
import {Poll} from "@welshman/domain"
import type {PollType, PollOption, PollResult} from "@welshman/domain"

const poll = Poll.configure(context).reader(event).parse()
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
  .renderTemplate()
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

const response = PollResponse.configure(context).reader(event).parse()
response.pollId()       // e-tag value
response.selections()   // unique "response" tag values

await PollResponse.configure(context)
  .writer()
  .setPollId(pollId)
  .addSelection(optionId)     // deduped
  .renderTemplate()
```

`PollResponse.validate()` requires a pollId.

## Report (kind 1984)

A NIP-56 report flags a pubkey and/or an event with a reason.

```typescript
import {Report} from "@welshman/domain"

const report = Report.configure(context).reader(event).parse()
report.pubkey()    // p-tag value
report.eventId()   // e-tag value (tag[1])
report.reason()    // reason from the e-tag or p-tag (tag[2])

await Report.configure(context)
  .writer()
  .setPubkey(pubkey)
  .setEventId(noteId)
  .setReason("spam")
  .renderTemplate()
```

A report's reason lives on both the `p` and `e` tags; the writer normalizes it so a reason set on either (or via `setReason`) is reflected on both. Unlike most content kinds, `ReportWriter` overrides `renderRoutes()` to `[userOutbox()]` — a report's `p`/`e` tags identify what is being flagged, not recipients to notify, so it publishes only to the author's own outbox.

## See also

- [Readers & Writers](./readers-and-writers) — the base `EventReader`/`EventWriter` pattern, the `configure` entry point, default routing, and `d`-tag validation for `Classified` and `TimeEvent`.
