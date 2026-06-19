import {first, parseJson} from "@welshman/lib"
import {ZAP_RECEIPT, getTagValue, getInvoiceAmount} from "@welshman/util"
import type {TrustedEvent, Zapper} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-57 kind-9735 zap receipt. Relay/LN-generated, so it's effectively read-only:
// we parse the bolt11 invoice and the embedded kind-9734 zap request (carried in
// the JSON "description" tag, which we expose as `plain`). The builder exists for
// completeness but is rarely used in practice.
export class ZapReceipt extends EventReader {
  readonly kind = ZAP_RECEIPT

  // The embedded kind-9734 zap request, parsed once from the JSON "description" tag.
  plain?: TrustedEvent

  protected async parse(signer?: ISigner) {
    const description = getTagValue("description", this.event.tags)

    this.plain = description ? parseJson(description) || undefined : undefined
  }

  bolt11() {
    return getTagValue("bolt11", this.event.tags)
  }

  // Invoice amount in millisats. getInvoiceAmount throws on a malformed bolt11,
  // so swallow that and report undefined (matches zapFromEvent's try/catch).
  invoiceAmount() {
    const bolt11 = this.bolt11()

    if (!bolt11) return undefined

    try {
      return getInvoiceAmount(bolt11)
    } catch {
      return undefined
    }
  }

  // The embedded kind-9734 zap request.
  request() {
    return this.plain
  }

  // The pubkey that requested the zap.
  sender() {
    return this.plain?.pubkey
  }

  recipient() {
    return getTagValue("p", this.event.tags)
  }

  // The zapped event, if any.
  eventId() {
    return getTagValue("e", this.event.tags)
  }

  // The comment the sender attached to the zap request.
  comment() {
    return this.plain?.content
  }

  preimage() {
    return getTagValue("preimage", this.event.tags)
  }

  // Port of zapFromEvent's NIP-57 verification (util/src/Zaps.ts). Returns false
  // unless the receipt is a legitimate, unforged zap from the given zapper.
  verify(zapper: Zapper): boolean {
    const request = this.request()
    const invoiceAmount = this.invoiceAmount()
    const recipient = this.recipient()

    // We need a parsed request and a parsed invoice amount to verify anything.
    if (!request || invoiceAmount === undefined) {
      return false
    }

    // Don't count zaps that the user requested for himself.
    if (request.pubkey === zapper.pubkey) {
      return false
    }

    const amount = getTagValue("amount", request.tags)
    const lnurl = getTagValue("lnurl", request.tags)

    // Verify that the zapper actually sent the requested amount (if supplied).
    if (amount && parseInt(amount) !== invoiceAmount) {
      return false
    }

    // If the recipient and the zapper are the same person, it's legit.
    if (recipient === this.event.pubkey) {
      return true
    }

    // If the sending client provided an lnurl tag, verify that too.
    if (lnurl && lnurl !== zapper.lnurl) {
      return false
    }

    // Verify that the receipt actually came from the recipient's zapper.
    if (this.event.pubkey !== zapper.nostrPubkey) {
      return false
    }

    return true
  }

  builder() {
    return new ZapReceiptBuilder(this)
  }
}

// Write side for a zap receipt. Receipts are normally relay/LN-generated, so this
// is rarely used; it builds the represented tags from raw draft fields.
export class ZapReceiptBuilder extends EventBuilder<ZapReceipt> {
  readonly kind = ZAP_RECEIPT

  bolt11?: string
  description?: string
  recipient?: string
  eventId?: string
  preimage?: string

  constructor(readonly reader?: ZapReceipt) {
    super(reader)

    // Consume the represented tags out of the carried-over extraTags so they
    // round-trip through the structured fields below rather than being emitted
    // twice (once from buildTags, once from the base's extraTags pass-through).
    this.bolt11 = first(this.consumeTags("bolt11"))?.[1]
    this.description = first(this.consumeTags("description"))?.[1]
    this.recipient = first(this.consumeTags("p"))?.[1]
    this.eventId = first(this.consumeTags("e"))?.[1]
    this.preimage = first(this.consumeTags("preimage"))?.[1]
  }

  setBolt11(bolt11: string) {
    this.bolt11 = bolt11

    return this
  }

  setDescription(description: string) {
    this.description = description

    return this
  }

  setRecipient(recipient: string) {
    this.recipient = recipient

    return this
  }

  setEventId(eventId: string) {
    this.eventId = eventId

    return this
  }

  setPreimage(preimage: string) {
    this.preimage = preimage

    return this
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.bolt11) tags.push(["bolt11", this.bolt11])
    if (this.description) tags.push(["description", this.description])
    if (this.recipient) tags.push(["p", this.recipient])
    if (this.eventId) tags.push(["e", this.eventId])
    if (this.preimage) tags.push(["preimage", this.preimage])

    return tags
  }
}
