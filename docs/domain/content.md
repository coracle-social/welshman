# Content

Content kinds: NIP-01 notes, NIP-09 deletes, NIP-25 reactions, NIP-18 reposts, NIP-68 pictures, NIP-17 direct messages, NIP-22 comments, NIP-7D forum threads, NIP-23 articles, NIP-C7 chat messages, NIP-99 classifieds, NIP-84 highlights, NIP-52 calendar events, NIP-88 polls, NIP-56 reports, NIP-32 labels, saved feeds, NIP-78 app data, and the pinboard system. Each is a plain `EventReader` / `EventWriter` pair, except that `AppData` has an `AsyncEventReader` — see [Readers & Writers](./readers-and-writers) for the base pattern. The parameterized-replaceable kinds (`Article`, `Classified`, `DateEvent`, `TimeEvent`, `CalendarRsvp`, `Pinboard`, `Pin`, `Feed`, `AppData`) need a `d` tag (`setIdentifier()`).

Every example below assumes a bound `KindContext`. Only `AppData` decrypts, so `reader(event).parse()` needs no await for any other kind on this page. A writer's `renderTemplate()` returns an unsigned `EventTemplate`, which you sign yourself:

```typescript
import {stamp} from "@welshman/util"

const signed = await signer.sign(stamp(await writer.renderTemplate()))
```

In `@welshman/app`, `app.use(Domain).reader(Kind)` / `.writer(Kind, reader?)` configure the kind for you, and `app.use(Domain).command(writer)` wraps the rendered event in a publishable `Command`. See [Readers & Writers](./readers-and-writers#with-welshmanapp-domain--command).

Unless a kind says otherwise, writers route to the **author's outbox plus every p-tagged pubkey's inbox**, the default `EventWriter.renderRoutes()`, so a note or reply reaches the people it mentions. `DirectMessage`, `Report` and `Label` override it, `Delete` adds the deleted events' relays, and `Message` publishes only to the relay it is pinned to (see below).

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

## Delete (kind 5)

A NIP-09 deletion request. The content is the reason.

```typescript
import {Delete} from "@welshman/domain"

const deletion = Delete.configure(context).reader(event).parse()
deletion.ids()         // e-tag values
deletion.addresses()   // a-tag values
deletion.kinds()       // k-tag values
deletion.reason()      // event.content

await Delete.configure(context)
  .writer()
  .addEvent(event)
  .setReason("posted by mistake")
  .renderTemplate()
```

`addEvent(event, roomUrl?)` e-tags the event with a hint from its author's outbox, adds a `k` tag for its kind, and a-tags a replaceable event as well. An event carrying an `h` tag is a NIP-29 room event, so the delete takes the same `h` tag and publishes to `roomUrl`, and `addEvent` throws when `roomUrl` is missing. The writer adds a `seen` route for every deleted event id to the default routing, so the delete reaches the relays those events were found on. `validate()` requires an `e` or `a` tag.

## Reaction (kind 7)

A NIP-25 reaction. The content is `+`, `-`, a unicode emoji, or a `:shortcode:` naming a NIP-30 `emoji` tag, set with `setContent`.

```typescript
import {Reaction} from "@welshman/domain"

const reaction = Reaction.configure(context).reader(event).parse()
reaction.eventId()        // e-tag value
reaction.eventAddress()   // a-tag value
reaction.pubkey()         // p-tag value
reaction.eventKind()      // k-tag value

await Reaction.configure(context).writer().setEvent(event).setContent("+").renderTemplate()
```

`setEvent(event)` replaces any existing target. It writes a `k` tag, p-tags the author, and e-tags the event with a hint from the author's outbox, adding an `a` tag when the event is replaceable. `validate()` requires an `e` tag.

## Repost (kind 6) and GenericRepost (kind 16)

NIP-18 reposts. `Repost` reposts a note and `GenericRepost` reposts any other kind, naming it in a `k` tag. The two factories share `RepostReader`, `RepostWriter` and `RepostQuery`.

```typescript
import {Repost, GenericRepost} from "@welshman/domain"

const repost = Repost.configure(context).reader(event).parse()
repost.eventId()        // e-tag value
repost.eventAddress()   // a-tag value
repost.pubkey()         // p-tag value
repost.eventKind()      // 1 for kind 6, the k-tag value for kind 16
repost.repostedEvent()  // the event JSON-decoded from content, or undefined

await GenericRepost.configure(context).writer().setEvent(article).renderTemplate()
```

`setEvent(event)` replaces any existing target and JSON-encodes the event into the content. Like `Reaction`, it p-tags the author and e-tags the event (and a-tags a replaceable one) with hints from the author's outbox. Only `GenericRepost` adds the `k` tag. `validate()` requires an `e` tag. `repostedEvent()` parses the content without verifying it.

## Picture (kind 20)

A NIP-68 picture event. The content is the description and every image is a NIP-92 `imeta` tag, read and written through the media-attachment behavior any kind has.

```typescript
import {Picture} from "@welshman/domain"
import type {Imeta} from "@welshman/domain"

const picture = Picture.configure(context).reader(event).parse()
picture.title()      // "title" tag value
picture.imeta()      // Imeta[]
picture.topics()     // t-tag values
picture.location()   // "location" tag value
picture.geohash()    // "g" tag value

await Picture.configure(context)
  .writer()
  .setTitle("Sunrise")
  .setContent("a day out")
  .addImeta({
    url: "https://example.com/a.jpg",
    mimeType: "image/jpeg",
    blurhash: "…",
    dim: "3024x4032",
    alt: "A sunrise over the sea",
    hash: sha256,
    fallbacks: ["https://mirror.example.com/a.jpg"],
  })
  .setTopics(["photography"])
  .renderTemplate()
```

An `Imeta` is `{url, mimeType?, blurhash?, dim?, alt?, hash?, fallbacks?, extra?}`. `extra` holds the `imeta` entries this type doesn't model — NIP-68's `annotate-user`, say — as raw `key value` strings, so editing a picture another client wrote doesn't silently drop them.

`renderTemplate` derives the top-level `x` and `m` tags from the attached images, which NIP-68 uses to make pictures findable by hash and mime type. `validate()` requires at least one image.

## DirectMessage (kind 14)

A NIP-17 direct message. It is never signed or published on its own. It stays a rumor, gift-wrapped once per recipient (see [gift-wrapped messages](../app/publishing#gift-wrapped-messages)).

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

`DirectMessageWriter` renders no routes, because each gift-wrapped copy goes to its own recipient's relays, and `Wraps` resolves those per recipient. `DirectMessageQuery` routes to the user's NIP-17 messaging relays.

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

// ...or hand `replyTo` the event being answered and let it place both
await Comment.configure(context).writer().setContent("reply").replyTo(event).renderTemplate()
```

`replyTo` handles an answered event whose kind is not known in advance. A comment answering a comment inherits that comment's root tags, so the reply stays in the thread it is part of; anything else becomes the root of its own thread. Either way the answered event is the parent.

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

## Article (kind 30023)

A NIP-23 long-form article. The content is the article body.

```typescript
import {Article} from "@welshman/domain"

const article = Article.configure(context).reader(event).parse()
article.title()         // "title" tag value
article.summary()       // "summary" tag value
article.image()         // "image" tag value
article.publishedAt()   // "published_at" tag as int, falling back to created_at
article.topics()        // t-tag values

await Article.configure(context)
  .writer()
  .setIdentifier("my-article")           // required d tag for kind 30023
  .setTitle("My article")
  .setSummary("A short summary")
  .setPublishedAt(publishedAt)
  .setTopics(["nostr"])
  .setContent(markdown)
  .renderTemplate()
```

`setImage` sets the `image` tag. `publishedAt()` falls back to `created_at` because an addressable event's `created_at` changes with every edit.

## Message (kind 9)

A NIP-C7 chat message. The content is the message, and a reply is another kind 9 whose content opens with a reference to the message it answers. `getContentQuote` accepts every form [@welshman/content](../content/) renders as a quote — an `nevent1`, `note1` or `naddr1`, with a `nostr:` or `web+nostr:` prefix or none, in any case — ending at the first whitespace or at the end of the message, so a reply with no body still reads as one.

```typescript
import {Message} from "@welshman/domain"

const message = Message.configure(context).reader(event).parse()
message.parent()   // the Quote this message replies to, or undefined
message.quotes()   // every q tag as a Quote, the parent included

await Message.configure(context)
  .writer()
  .setContent("yes")
  .setParent(parentEvent)   // reference + ["q", id, "", pubkey] + ["p", pubkey, hint]
  .setRoom(relayUrl, "general")
  .renderTemplate()
```

`setParent(event)` makes a reply. It holds the parent as a `Quote` (`writer.parentQuote`) and renders the reference, the `q` tag naming the parent and its author, and the `addMention` p-tag that a notification feed filters on, since a reference on its own carries neither the author nor the mention. All of it renders from that quote, so call order against `setContent` and `setRoom` doesn't matter, and `clearParent()` removes it.

A quote's `value` is the parent's id, or its address when the parent is replaceable, the way `getIdOrAddress` picks between them. An address parent tags `["q", address, "", pubkey]` and writes an `naddr1` reference, and `MessageQuery.forParent` asks for both forms, since another client may have quoted the same event by id.

Neither the `q` tag nor the reference carries a relay, since a reply and the message it answers are both on the relay hosting the chat.

A writer built from a reader takes its parent from `parent()` and lifts the reference out of `content`, which then holds the message body alone. The `q` tag is left where it is. A parent that something already tags — the event being edited, a mid-content quote promoted to a reply, an `addQuote` of the same event — is not tagged a second time. A reference that names no author keeps the author its `q` tag named.

NIP-18 quotes use the same tag, so `parent()` looks up the quote the content opens with rather than taking the first one, and a message that shares one event and replies to another may tag them in either order. Quotes elsewhere in the content are the caller's to tag with `addQuote`. A reply nothing tagged falls back to the content's own reference. `getContentQuote(content)` is exported for callers that need the `Quote` itself.

Chat is scoped to the relay hosting it, so `MessageWriter` sets `requiresRelays = true` and `MessageQuery.renderRoutes()` returns nothing. A NIP-29 room pins both with `setRoom(url, roomId)`, described under [Publishing to the room relay](./rooms#publishing-to-the-room-relay); a relay hosting chat without NIP-29 pins them with `forceRoutes`/`setRoutes`.

```typescript
const {filters, relays} = await Message.configure(context)
  .query()
  .setRoom(relayUrl, "general")
  .setLimit(100)
  .render()
```

`MessageQuery.forParent(event)` adds the `#q` filter for a message's replies.

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

A `Pin` references exactly one item — a nostr event (`e`), an addressable event (`a`), or an external id (`i` + optional `k` per NIP-73) — exposed as a discriminated `PinReference`. It can belong to multiple boards via `A` tags; a pin with none is a profile pin. Its `content` is an optional comment. Kind 39067 is parameterized-replaceable, so each pin needs its own unique `d` tag (`setIdentifier()`), or every pin from the same author would collide at the same address.

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

`setEvent`/`setAddress`/`setExternal` each replace any prior reference. `validate()` throws if none of `e`/`a`/`i` is present.

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

## DateEvent (kind 31922)

A NIP-52 date-based calendar event: an all-day event, where `TimeEvent` below starts and ends at an instant. Such an event belongs to no timezone, so its bounds are `YYYY-MM-DD` strings rather than timestamps, and `end` is the day *after* the last one covered.

```typescript
import {DateEvent} from "@welshman/domain"

const evt = DateEvent.configure(context).reader(event).parse()
evt.title()      // "title" tag value
evt.location()   // "location" tag value
evt.start()      // "YYYY-MM-DD", or undefined
evt.end()        // "YYYY-MM-DD" (exclusive), absent on a one-day event

await DateEvent.configure(context)
  .writer()
  .setIdentifier()                       // required d tag for kind 31922
  .setTitle("Nostrica")
  .setLocation("Costa Rica")
  .setStart("2024-03-19")
  .setEnd("2024-03-22")                  // covers the 19th, 20th and 21st
  .renderTemplate()
```

Like `TimeEvent`, the writer derives one `["D", dayIndex]` tag per day covered, so both calendar kinds are discoverable by the same day-bucket filter. An event with a start and no end covers that one day; a start that doesn't parse as a date produces no index at all.

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

When both `start` and `end` are set, `renderDomainTags` generates one `["D", dayIndex]` tag per day in `[start, end)`, so the event is discoverable by day.

## CalendarRsvp (kind 31925)

A NIP-52 rsvp to a calendar event. It names the event by address rather than by id, since a `TimeEvent` may be edited after the rsvp is written, and carries a `status` — `accepted`, `declined`, or `tentative` — plus an optional `fb` saying whether the author is otherwise free or busy.

```typescript
import {CalendarRsvp} from "@welshman/domain"
import type {RsvpStatus, RsvpFreebusy} from "@welshman/domain"

const rsvp = CalendarRsvp.configure(context).reader(event).parse()
rsvp.calendarEvent()     // the event's address
rsvp.calendarEventId()   // e-tag value, when the author pinned one revision
rsvp.status()            // RsvpStatus | undefined
rsvp.freebusy()          // RsvpFreebusy | undefined

await CalendarRsvp.configure(context)
  .writer()
  .setIdentifier()                            // required d tag for kind 31925
  .setCalendarEventFromEvent(calendarEvent)   // or setCalendarEvent(address)
  .setStatus("accepted")
  .setFreebusy("busy")
  .renderTemplate()
```

`setCalendarEventFromEvent` also pins the rsvp to that revision with an `e` tag and p-tags the organizer, which under the default routing is what delivers the rsvp to their inbox. The `e` hint comes from the organizer's outbox; pass a relay (`setCalendarEventFromEvent(event, url)`, or `setCalendarEvent(address, url)`) when the event lives on a known relay such as a NIP-29 space, and it becomes the hint for both the `a` and `e` tags. `setCalendarEvent` takes an address alone, for answering an event you haven't fetched.

Free/busy is only meaningful when you are coming, so `setStatus("declined")` clears it, and `validate()` rejects one set after declining. An rsvp with no calendar event or no status is refused the same way.

To read an event's rsvps, `forCalendarEvent(address)` filters on the `a` tag and asks the organizer's inbox, where rsvps addressed to them arrive:

```typescript
const {filters, relays} = await CalendarRsvp.configure(context)
  .query()
  .forCalendarEvent(address)
  .render()
```

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

A report's reason lives on both the `p` and `e` tags, and the writer keeps a reason set on either (or via `setReason`) on both. `ReportWriter` routes to `[userOutbox()]` only, because a report's `p`/`e` tags identify what is being flagged rather than recipients to notify.

## Label (kind 1985)

A NIP-32 label. `L` tags declare namespaces and `l` tags carry the labels within them, while the labeled subjects are ordinary `e`, `p`, `a`, `t` and `r` tags. One event may label several subjects across several namespaces.

```typescript
import {Label} from "@welshman/domain"

const label = Label.configure(context).reader(event).parse()
label.namespaces()          // L-tag values
label.labels()              // every l-tag value
label.labels("ISO-639-1")   // l-tag values in one namespace
label.eventIds()            // e-tag values
label.pubkeys()             // p-tag values
label.addresses()           // a-tag values
label.topics()              // t-tag values
label.urls()                // r-tag values

await Label.configure(context)
  .writer()
  .addLabel("en", "ISO-639-1")   // ["L", "ISO-639-1"] and ["l", "en", "ISO-639-1"]
  .addEventId(noteId)            // also addPubkey, addAddress, addTopic, addUrl
  .renderTemplate()
```

`addLabel(name, namespace)` adds the `L` and `l` tags unless they are already present. `removeLabel(name, namespace)` drops the `l` tag, and drops the `L` tag too once no label in that namespace is left. `urls()` reads `r` tags as relay urls, so it returns only `ws`/`wss` urls, normalized. `validate()` requires at least one `l` tag. `LabelWriter` routes to `[userOutbox()]` only, since the subject tags name what is labeled rather than who should receive it.

## Feed (kind 31890)

A saved feed definition. The `feed` tag holds a JSON-encoded [`@welshman/feeds`](../feeds/) `Feed`.

```typescript
import {Feed} from "@welshman/domain"

const feed = Feed.configure(context).reader(event).parse()
feed.title()         // "title" tag value, or ""
feed.description()   // "description" tag value, or ""
feed.definition()    // the parsed Feed, or undefined

await Feed.configure(context)
  .writer()
  .setIdentifier()                       // required d tag for kind 31890
  .setTitle("Friends")
  .setDescription("Notes from people I follow")
  .setDefinition(definition)
  .renderTemplate()
```

`FeedQuery` routes to the queried authors' outboxes. A user's saved feeds are listed by `FeedList` (kind 10014, see [Lists](./lists)).

## AppData (kind 30078)

NIP-78 application data, keyed by the `d` tag. The content is JSON, optionally NIP-44 encrypted to the author, so `parse()` returns a promise.

```typescript
import {AppData} from "@welshman/domain"

const data = await AppData.configure(context).reader(event).parse()
data.values<Settings>()   // the parsed JSON, or undefined
data.encrypted            // true when the content was not plain JSON
data.decrypted            // true when the content is readable

await AppData.configure(context)
  .writer(data)
  .setValues({theme: "dark"})
  .setEncrypted(true)
  .renderTemplate()
```

The reader decrypts only with the author's own signer in the context. A writer built from a reader that couldn't decrypt keeps the original ciphertext, and `validate()` throws if `setValues` was called on it. Encrypting on render requires a signer. `AppDataQuery` routes to the queried authors' outboxes.

## See also

- [Readers & Writers](./readers-and-writers) — the base `EventReader`/`EventWriter` pattern, the `configure` entry point, default routing, and `d`-tag validation for `Classified`, `DateEvent`, `TimeEvent` and `CalendarRsvp`.
