import {parseJson, spec} from "@welshman/lib"
import {ZAP_RECEIPT, tagSpec, tagValue, getInvoiceAmount} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-57 kind-9735 zap receipt (relay/LN-generated, read-only).
export class ZapReceiptReader extends EventReader {
  plain?: TrustedEvent

  parse() {
    const description = tagValue(tagSpec("description"), this.event.tags)

    this.plain = description ? parseJson(description) || undefined : undefined

    return this
  }

  bolt11() {
    return tagValue(tagSpec("bolt11"), this.event.tags)
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
    return tagValue(tagSpec("p"), this.event.tags)
  }

  eventId() {
    return tagValue(tagSpec("e"), this.event.tags)
  }

  comment() {
    return this.plain?.content
  }

  preimage() {
    return tagValue(tagSpec("preimage"), this.event.tags)
  }
}

export class ZapReceiptWriter extends EventWriter<ZapReceiptReader> {
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
  kind: ZAP_RECEIPT,
  reader: ZapReceiptReader,
  writer: ZapReceiptWriter,
})
