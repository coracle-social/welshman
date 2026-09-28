# Zaps

Three kinds model the lightning-zap flow (NIP-57) and zap goals (NIP-75): `ZapRequest` (what a sender hands the recipient's LNURL service to ask for a zap), `ZapReceipt` (what the recipient's LN service publishes as proof of payment), and `ZapGoal` (a fundraising target). All three are plain `EventReader` / `EventWriter` subclasses; see [Readers & Writers](./readers-and-writers) for the base pattern. The [`Zapper`](#zapper) class models the LNURL service and validates receipts, and [zap splits](#zap-splits) live on the base reader and writer.

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

## See also

- [Readers & Writers](./readers-and-writers) — the base `EventReader`/`EventWriter` pattern, configuration, routing, and publishing with `@welshman/app`.
