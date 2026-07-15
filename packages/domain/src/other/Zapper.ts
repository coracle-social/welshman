import {now, fromPairs} from "@welshman/lib"
import {ZAP_RECEIPT} from "@welshman/util"
import type {TrustedEvent, Filter} from "@welshman/util"
import type {ZapReceiptReader} from "../kinds/ZapReceipt.js"

// The result of validating a zap receipt against its zapper: the kind-9734
// request, the kind-9735 response, and the amount in millisats parsed from the
// receipt's bolt11 invoice. Constructed by `Zapper.validate`.
export type Zap = {
  request: TrustedEvent
  response: TrustedEvent
  invoiceAmount: number
}

// The LNURL-pay service backing a pubkey's lightning address, keyed by lnurl.
// These aren't nostr events — they're fetched over HTTP from the lnurl endpoint —
// so `Zapper` is a plain domain object rather than a reader/writer pair. `pubkey`
// (the recipient) and `nostrPubkey` (the key the service signs receipts with) are
// both required: validation is meaningless without them.
export type ZapperValues = {
  lnurl: string
  pubkey: string
  nostrPubkey: string
  callback?: string
  minSendable?: number
  maxSendable?: number
  allowsNostr?: boolean
}

export class Zapper {
  lnurl!: string
  pubkey!: string
  nostrPubkey!: string
  callback?: string
  minSendable?: number
  maxSendable?: number
  allowsNostr?: boolean

  constructor(values: ZapperValues) {
    // Copy every value, including any non-standard lnurl fields the endpoint
    // returned, so nothing is silently dropped for downstream consumers.
    Object.assign(this, values)
  }

  /**
   * Validate a parsed kind-9735 zap receipt against this zapper per NIP-57 and,
   * if it checks out, return the reconstructed `Zap`. Returns undefined when the
   * receipt is malformed or fails validation:
   *
   * - Missing/malformed zap request or bolt11 invoice
   * - Invoice amount doesn't match the requested amount
   * - Self-zap (request author is the zapper's own pubkey)
   * - lnurl mismatch (if the request carried an lnurl tag)
   * - Receipt not signed by the zapper's nostr pubkey
   */
  validate(receipt: ZapReceiptReader): Zap | undefined {
    const request = receipt.request()
    const invoiceAmount = receipt.invoiceAmount()

    if (!request || invoiceAmount === undefined) {
      return undefined
    }

    // Don't count zaps that the user requested for himself
    if (request.pubkey === this.pubkey) {
      return undefined
    }

    const {amount, lnurl} = fromPairs(request.tags)

    // Verify that the zapper actually sent the requested amount (if it was supplied)
    if (amount && parseInt(amount) !== invoiceAmount) {
      return undefined
    }

    // If the sending client provided an lnurl tag, verify that too
    if (lnurl && lnurl !== this.lnurl) {
      return undefined
    }

    // Verify that the receipt actually came from the recipient's zapper
    if (receipt.event.pubkey !== this.nostrPubkey) {
      return undefined
    }

    return {request, response: receipt.event, invoiceAmount}
  }

  // A filter matching zap receipts this zapper would publish for the given
  // recipient (and optionally a specific event).
  getResponseFilter(pubkey: string, eventId?: string): Filter {
    const filter: Filter = {
      kinds: [ZAP_RECEIPT],
      authors: [this.nostrPubkey],
      since: now() - 30,
      "#p": [pubkey],
    }

    if (eventId) {
      filter["#e"] = [eventId]
    }

    return filter
  }
}
