# Zaps

Three kinds model the lightning-zap flow (NIP-57) and zap goals (NIP-75): `ZapRequest` (what a sender hands the recipient's LNURL service to ask for a zap), `ZapReceipt` (what the recipient's LN service publishes as proof of payment), and `ZapGoal` (a fundraising target). All three are plain `EventReader` / `EventWriter` subclasses; see [Readers & Writers](./readers-and-writers) for the base pattern. The [`Zapper`](#zapper) class models the LNURL service and validates receipts, and [zap splits](#zap-splits) live on the base reader and writer. [BOLT12 zaps](#bolt12-zaps-nip-b1) are a second flow with three kinds of their own, and no LNURL service in it.

The low-level lightning helpers (`getLnUrl`, `getInvoiceAmount`, `hrpToMillisat`, `toMsats`/`fromMsats`) are in `@welshman/util`; see [util/Lightning](../util/lightning).

The examples below use the `@welshman/app` `Domain` plugin. Without the app, substitute `ZapRequest.configure(context).reader(event).parse()`.

## Zap request (kind 9734)

The zap request sent to a recipient's LNURL callback. The comment is the event content, and everything else is tags.

```typescript
import {ZapRequest} from "@welshman/domain"
import {Domain} from "@welshman/app"

const req = app.use(Domain).reader(ZapRequest)(event)
req.amount()       // millisats as an int, or undefined ("amount" tag)
req.lnurl()        // string | undefined
req.recipient()    // p-tag value
req.eventId()      // e-tag value (the zapped event)
req.urls()         // the "relays" tag, sliced past the key
req.content()      // event.content (the comment)
req.anonymous()    // whether an "anon" tag is present

const writer = app.use(Domain).writer(ZapRequest)
  .setAmount(21000)                         // millisats
  .setRecipient(recipientPubkey)
  .setLnurl(lnurl)
  .setEvent(zappedEvent)                    // ["e", id], and the goal rule below
  .setAnonymous(true)                       // add/remove the "anon" tag
  .setContent("great post")

const template = await writer.renderTemplate()      // EventTemplate {kind, content, tags}
```

Each setter drops any existing tag of the same key before adding the new one, so calling a setter twice replaces rather than duplicates.

### Fetching an invoice

`requestInvoice(zapper)` renders the request, signs it with the context's signer, and sends it to the zapper's LNURL callback to fetch a bolt11 invoice. It returns the signed `event` alongside either an `invoice` or an `error`:

```typescript
const writer = app.use(Domain).writer(ZapRequest)
  .setAmount(21000)
  .setRecipient(recipientPubkey)
  .setLnurl(zapper.lnurl)

// {event: SignedEvent, invoice?: string, error?: string}
const {event, invoice, error} = await writer.requestInvoice(zapper)

if (invoice) {
  // pay invoice with a lightning wallet
}
```

### Routing: where the receipt goes

A zap request is never published. It goes to the LNURL callback, and the zapper publishes a receipt in response. The request's routes are therefore where that receipt has to land, and they render into the `relays` tag NIP-57 asks for. The default is the recipient's inbox:

```typescript
const writer = app.use(Domain).writer(ZapRequest)
  .setRecipient(recipientPubkey)   // the receipt goes to their inbox relays
  .forceRoutes(relay(spaceUrl))    // or here instead, zapping inside a space

await writer.relays()              // where to watch for the receipt
```

This writer takes its routes whole rather than the top-scoring few, because a receipt missing from a relay is a zap nobody watching there sees.

Zapping a kind-9041 goal with `setEvent` adds the goal's own relays, since that is where NIP-75 totals it. Those survive `forceRoutes`, so a goal zapped inside a space is requested on both.

## Zap receipt (kind 9735)

The recipient's lightning service generates the receipt, so clients only read it. `parse` decodes the embedded zap request out of the `description` tag, and the getters read through it.

```typescript
import {ZapReceipt} from "@welshman/domain"
import {Domain} from "@welshman/app"

const receipt = app.use(Domain).reader(ZapReceipt)(event)
receipt.bolt11()          // the invoice
receipt.invoiceAmount()   // amount parsed from bolt11, or undefined on parse failure
receipt.request()         // the embedded zap-request event (TrustedEvent | undefined)
receipt.sender()          // request.pubkey
receipt.recipient()       // p-tag value
receipt.eventId()         // e-tag value
receipt.comment()         // the embedded request's content
receipt.preimage()        // string | undefined
```

To check a receipt against a zapper, pass the parsed reader to [`Zapper.validate`](#zapper).

A `ZapReceiptWriter` (`setBolt11`, `setDescription`, `setRecipient`, `setEventId`, `setPreimage`) exists for tests or a service generating receipts.

## Zapper

`Zapper` models the LNURL-pay service behind a pubkey's lightning address. It is fetched over HTTP from the lnurl endpoint rather than read from an event, so it is a plain class rather than a reader/writer pair. In `@welshman/app` the `Zappers` collection loads and caches them by lnurl, keeping only services that set `allowsNostr` and a `nostrPubkey`.

`lnurl`, `pubkey` (the recipient), and `nostrPubkey` (the key the service signs receipts with) are required.

```typescript
import {Zapper} from "@welshman/domain"

const zapper = new Zapper({
  lnurl: "lnurl1...",
  pubkey: "…",        // the recipient being zapped
  nostrPubkey: "…",   // pubkey the LN service signs receipts with
  callback: "https://…",
  minSendable: 1000,
  maxSendable: 100000000,
  allowsNostr: true,
})
```

`validate(receipt)` takes a parsed [`ZapReceiptReader`](#zap-receipt-kind-9735) and checks it against this zapper per NIP-57. If it passes, it returns the reconstructed `Zap` (`{request, response, invoiceAmount}`, exported alongside `Zapper`), and otherwise `undefined`. It rejects a missing request or invoice, amount mismatches, self-zaps, lnurl mismatches, and receipts not signed by the zapper's nostr pubkey.

```typescript
import type {Zap} from "@welshman/domain"

const receipt = app.use(Domain).reader(ZapReceipt)(event)
const zap: Zap | undefined = zapper.validate(receipt)
```

`getResponseFilter(pubkey, eventId?)` builds a filter for the zap receipts this zapper would publish for a recipient, optionally scoped to a single zapped event:

```typescript
const filter = zapper.getResponseFilter(recipientPubkey, zappedNoteId)
// {kinds: [9735], authors: [zapper.nostrPubkey], "#p": [recipient], "#e": [eventId], since}
```

## Zap splits

Any event can spread its zaps across multiple recipients via NIP-57 Appendix G `zap` tags (`["zap", pubkey, relayHint, weight]`). Splits are read off an event's tags regardless of kind, so they are standalone functions in `behaviors/ZapSplits`:

```typescript
import {getZapSplits, splitZapAmount} from "@welshman/domain"

getZapSplits(event)
// ZapSplit[] — [{pubkey, relay?, weight}]. No zap tags -> whole zap to the author.
// If some recipients carry weights, unweighted ones drop to weight 0.

splitZapAmount(event, 100_000)
// ZapSplitAmount[] — each split plus an integer `amount`. Rounding remainder goes
// to the highest-weighted recipient so the parts sum back to the total exactly.
```

`EventWriter` has `addZapSplit(pubkey, weight)` and `removeZapSplit(pubkey)` for writing the tags.

## Zap goal (kind 9041)

A fundraising target. The title is the content, and the goal amount and relays are tags.

```typescript
import {ZapGoal} from "@welshman/domain"
import {Domain} from "@welshman/app"

const goal = app.use(Domain).reader(ZapGoal)(event)
goal.title()      // event.content (or "")
goal.summary()    // "summary" tag value
goal.amount()     // millisats as an int, default 0
goal.urls()       // "relays" tag values
goal.closedAt()   // "closed_at" tag as a timestamp, or undefined

const template = await app.use(Domain).writer(ZapGoal)
  .setTitle("Fund the relay")               // sets event.content
  .setSummary("keeps the lights on")
  .setAmount(1000000)                       // millisats
  .setUrls(["wss://relay.example"])         // a single ["relays", ...urls] tag
  .renderTemplate()
```

`validate()` requires a title (`ZapGoal requires a title`) and at least one relay (`ZapGoal requires at least one relay`). The writer's constructor always seeds an `amount` tag, defaulting to `["amount", "0"]`.

### Progress

`progress(zaps)` totals the [`Zap`](#zapper)s a goal was sent, in millisats, alongside the target and the pubkeys that contributed. Per NIP-75 a zap that landed after the goal's `closed_at` doesn't count, and `counted(zaps)` applies that rule on its own for callers that want the list rather than the totals.

```typescript
goal.progress(zaps)
// {zaps, amount, target, contributors}

goal.counted(zaps)   // Zap[], the ones that landed before it closed
```

Validating a receipt needs the recipient's zapper, so the caller supplies the zaps. In `@welshman/app` the [`ZapGoals`](../app/data#zap-goals-nip-75) plugin reads receipts out of the repository, validates them, and computes progress as one projection.

## BOLT12 zaps (NIP-B1)

[NIP-B1](https://github.com/nostr-protocol/nips/pull/2421) pays a recipient's reusable BOLT12 offer instead of an LNURL callback, so no zapper publishes the receipt. The payer signs the zap and carries the lightning payment proof in it. Three kinds model that flow. `Bolt12Offer` (kind 10058) is the recipient's announcement of the offers they accept. `Bolt12ZapIntent` (kind 9737) is what the payer signs before paying, and is embedded in the zap rather than published. `Bolt12Zap` (kind 9736) is the public zap.

The NIP is a draft and its kind numbers are candidates.

### Offer announcement (kind 10058)

```typescript
import {Bolt12Offer} from "@welshman/domain"

const announcement = app.use(Domain).reader(Bolt12Offer)(event)
announcement.offers()    // canonical raw offers, lowercased with + and whitespace removed

const template = await app.use(Domain).writer(Bolt12Offer)
  .addOffer("lno1...")              // canonicalized, replacing the same offer if present
  .renderTemplate()
```

`validate()` requires at least one offer and refuses any tag that is not a BOLT12 offer. `removeOffer(offer)` and `setOffers(offers)` canonicalize what they are given, so an offer written in another form still matches. `offersAreCanonical()` on a reader is NIP-B1's stricter rule, which `validate` on a zap applies to the announcement it embeds: every tag carries a canonical offer, where `offers()` drops the ones that do not.

### Zap intent (kind 9737)

The intent binds the payer's key to the recipient, the target, the amount and the offer before any payment is attempted. Its `zap_id` is seeded with 128 bits of entropy unless you set one.

```typescript
import {Bolt12ZapIntent} from "@welshman/domain"

const writer = app.use(Domain).writer(Bolt12ZapIntent)
  .setRecipient(recipientPubkey)
  .setAmount(21000)                 // millisats
  .setOfferEvent(announcementEvent) // the complete signed kind 10058
  .setEvent(zappedEvent)            // ["e", id] or ["a", address], plus ["k", kind]
  .setContent("excellent note")     // the zap comment

const intent = await signer.sign(stamp(await writer.renderTemplate()))
```

`payerNote()` on a reader is the `nostr:nipB1:<intent id>` string the lightning payment has to carry as its `invreq_payer_note`, so the settled proof binds to this zap and no other.

### Zap (kind 9736)

```typescript
import {Bolt12Zap} from "@welshman/domain"

const template = await app.use(Domain).writer(Bolt12Zap)
  .setIntent(intent)                // description tag, plus every tag both events share
  .setProof("lnp1...")              // the settled BOLT12 payer proof
  .setPayer(payerPubkey)            // omitted for an anonymous zap, which uses an ephemeral key
  .renderTemplate()
```

`setIntent` copies the content and the `p`, `amount`, `offer_event`, `e`, `a` and `k` tags off the intent, so the two events agree about what was paid for.

A reader exposes `recipient`, `payer`, `amount`, `proof`, `eventId`, `targetAddress`, `targetKind`, `target`, `offers`, and `targetsProfile` for a zap of the recipient rather than of anything they wrote. `intent()` and `offer()` return the embedded events, having verified their signatures — they arrive as JSON rather than from a relay, so nothing else does. Neither is parse state, so a reader costs nothing until something asks for one.

An anonymous zap omits `P` and is signed with an ephemeral key, so a writer holding no `P` tag publishes to the recipient's inboxes alone rather than adding the user's own outbox relays.

### Validating and counting

`validate()` runs NIP-B1's validation as far as nostr reaches and returns a `Bolt12ZapClaim`, or undefined. It checks both embedded signatures, the structure of the zap and the intent, that the zap repeats what the payer signed, and that the recipient authored the announcement before the intent embedded it.

```typescript
import type {Bolt12ZapClaim} from "@welshman/domain"

const zap = app.use(Domain).reader(Bolt12Zap)(event)
const claim: Bolt12ZapClaim | undefined = zap.validate()
// {event, intent, offer, offers, target, amount, proof, payerNote}
```

The `lnp` proof is undecoded, so counting a claim means running the BOLT12 payer-proof checks over the proof against the claim's `payerNote`, `amount` and `offers`. `sumBolt12Zaps` takes that check as a callback returning the proof's `invoice_payment_hash`, and totals the claims it validates:

```typescript
import {sumBolt12Zaps} from "@welshman/domain"

sumBolt12Zaps(claims, claim => paymentHashIfValid(claim))
// millisats, one payment counted once, at the lower amount when two claims share a hash
```

A claim's `target` is the event id or address the zap names, and undefined for a zap of the recipient themselves. Deduplication is per target, and a profile total is the claims whose `target` is undefined — a `#p` query answers with zaps of that pubkey's events too.

A query asks for zaps by target:

```typescript
const {filters, relays} = await app.use(Domain).query(Bolt12Zap)
  .forEvent(zappedEvent)     // #e for a regular event, #a for a replaceable one
  .render()
```

## See also

- [Readers & Writers](./readers-and-writers) — the base `EventReader`/`EventWriter` pattern, configuration, routing, and publishing with `@welshman/app`.
