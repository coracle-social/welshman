import {parseJson} from "@welshman/lib"
import {ZAP_RECEIPT, getTagValue, getInvoiceAmount} from "@welshman/util"
import type {EventTemplate, TrustedEvent, Zapper} from "@welshman/util"
import {DomainObject} from "./base.js"

export type ZapReceiptValues = {
  bolt11?: string
  invoiceAmount?: number
  request?: TrustedEvent
  recipient?: string
  eventId?: string
  preimage?: string
}

export const makeZapReceiptValues = (
  values: Partial<ZapReceiptValues> = {},
): ZapReceiptValues => ({...values})

// NIP-57 kind-9735 zap receipt. Relay/LN-generated, so it's read-only in spirit:
// we parse the bolt11 invoice and the embedded kind-9734 request, and round-trip
// the source event when serializing.
export class ZapReceipt extends DomainObject<ZapReceiptValues> {
  readonly kind = ZAP_RECEIPT
  values = makeZapReceiptValues()

  protected normalizeValues(values: Partial<ZapReceiptValues> = {}) {
    return makeZapReceiptValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<ZapReceiptValues> {
    const bolt11 = getTagValue("bolt11", event.tags)
    const description = getTagValue("description", event.tags)

    return {
      bolt11,
      invoiceAmount: bolt11 ? getInvoiceAmount(bolt11) : undefined,
      request: description ? parseJson(description) || undefined : undefined,
      recipient: getTagValue("p", event.tags),
      eventId: getTagValue("e", event.tags),
      preimage: getTagValue("preimage", event.tags),
    }
  }

  bolt11() {
    return this.values.bolt11
  }

  // Invoice amount in millisats.
  invoiceAmount() {
    return this.values.invoiceAmount
  }

  // The embedded kind-9734 zap request.
  request() {
    return this.values.request
  }

  // The pubkey that requested the zap.
  sender() {
    return this.values.request?.pubkey
  }

  recipient() {
    return this.values.recipient
  }

  // The zapped event, if any.
  eventId() {
    return this.values.eventId
  }

  // The comment the sender attached to the zap request.
  comment() {
    return this.values.request?.content
  }

  preimage() {
    return this.values.preimage
  }

  // Port of zapFromEvent's NIP-57 verification (util/src/Zaps.ts). Returns false
  // unless the receipt is a legitimate, unforged zap from the given zapper.
  validate(zapper: Zapper): boolean {
    const {request, invoiceAmount, recipient} = this.values

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
    if (recipient === this.event?.pubkey) {
      return true
    }

    // If the sending client provided an lnurl tag, verify that too.
    if (lnurl && lnurl !== zapper.lnurl) {
      return false
    }

    // Verify that the receipt actually came from the recipient's zapper.
    if (this.event?.pubkey !== zapper.nostrPubkey) {
      return false
    }

    return true
  }

  // Receipts are relay/LN-generated; round-trip the source event verbatim.
  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      content: this.event?.content || "",
      tags: this.event?.tags || [],
    }
  }
}
