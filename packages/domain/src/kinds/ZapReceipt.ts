import {
  parseJson,
  spec} from "@welshman/lib"
import {ZAP_RECEIPT,
  getTagValue,
  getInvoiceAmount,
} from "@welshman/util"
import type {TrustedEvent, Zapper} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-57 kind-9735 zap receipt (relay/LN-generated, read-only).
export class ZapReceiptReader extends EventReader {
  readonly kind = ZAP_RECEIPT

  plain?: TrustedEvent

  async parse() {
    const description = getTagValue("description", this.event.tags)

    this.plain = description ? parseJson(description) || undefined : undefined
  }

  bolt11() {
    return getTagValue("bolt11", this.event.tags)
  }

  invoiceAmount() {
    const bolt11 = this.bolt11()

    if (!bolt11) return undefined

    try {
      return getInvoiceAmount(bolt11)
    } catch {
      return undefined
    }
  }

  request() {
    return this.plain
  }

  sender() {
    return this.plain?.pubkey
  }

  recipient() {
    return getTagValue("p", this.event.tags)
  }

  eventId() {
    return getTagValue("e", this.event.tags)
  }

  comment() {
    return this.plain?.content
  }

  preimage() {
    return getTagValue("preimage", this.event.tags)
  }

  verify(zapper: Zapper): boolean {
    const request = this.request()
    const invoiceAmount = this.invoiceAmount()
    const recipient = this.recipient()

    if (!request || invoiceAmount === undefined) {
      return false
    }

    if (request.pubkey === zapper.pubkey) {
      return false
    }

    const amount = getTagValue("amount", request.tags)
    const lnurl = getTagValue("lnurl", request.tags)

    if (amount && parseInt(amount) !== invoiceAmount) {
      return false
    }

    if (recipient === this.event.pubkey) {
      return true
    }

    if (lnurl && lnurl !== zapper.lnurl) {
      return false
    }

    if (this.event.pubkey !== zapper.nostrPubkey) {
      return false
    }

    return true
  }
}

export class ZapReceiptWriter extends EventWriter<ZapReceiptReader> {
  readonly kind = ZAP_RECEIPT


  setBolt11(bolt11: string) {
    return this.dropTags(spec(["bolt11"])).addTags(["bolt11", bolt11])
  }

  setDescription(description: string) {
    return this.dropTags(spec(["description"])).addTags(["description", description])
  }

  setRecipient(recipient: string) {
    return this.dropTags(spec(["p"])).addTags(["p", recipient])
  }

  setEventId(eventId: string) {
    return this.dropTags(spec(["e"])).addTags(["e", eventId])
  }

  setPreimage(preimage: string) {
    return this.dropTags(spec(["preimage"])).addTags(["preimage", preimage])
  }
}

export const ZapReceipt = new KindFactory({
  reader: ZapReceiptReader,
  writer: ZapReceiptWriter,
})
