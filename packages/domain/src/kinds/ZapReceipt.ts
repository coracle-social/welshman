import {first, parseJson} from "@welshman/lib"
import {ZAP_RECEIPT, getTagValue, getInvoiceAmount} from "@welshman/util"
import type {TrustedEvent, Zapper} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-57 kind-9735 zap receipt (relay/LN-generated, read-only).
export class ZapReceipt extends EventReader {
  readonly kind = ZAP_RECEIPT

  plain?: TrustedEvent

  protected async parse(signer?: ISigner) {
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

  builder() {
    return new ZapReceiptBuilder(this)
  }
}

export class ZapReceiptBuilder extends EventBuilder<ZapReceipt> {
  readonly kind = ZAP_RECEIPT

  bolt11Tag?: string[]
  descriptionTag?: string[]
  recipientTag?: string[]
  eventIdTag?: string[]
  preimageTag?: string[]

  constructor(readonly reader?: ZapReceipt) {
    super(reader)

    this.bolt11Tag = first(this.consumeTags("bolt11"))
    this.descriptionTag = first(this.consumeTags("description"))
    this.recipientTag = first(this.consumeTags("p"))
    this.eventIdTag = first(this.consumeTags("e"))
    this.preimageTag = first(this.consumeTags("preimage"))
  }

  setBolt11(bolt11: string) {
    this.bolt11Tag = ["bolt11", bolt11]

    return this
  }

  setDescription(description: string) {
    this.descriptionTag = ["description", description]

    return this
  }

  setRecipient(recipient: string) {
    this.recipientTag = ["p", recipient]

    return this
  }

  setEventId(eventId: string) {
    this.eventIdTag = ["e", eventId]

    return this
  }

  setPreimage(preimage: string) {
    this.preimageTag = ["preimage", preimage]

    return this
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.bolt11Tag) tags.push(this.bolt11Tag)
    if (this.descriptionTag) tags.push(this.descriptionTag)
    if (this.recipientTag) tags.push(this.recipientTag)
    if (this.eventIdTag) tags.push(this.eventIdTag)
    if (this.preimageTag) tags.push(this.preimageTag)

    return tags
  }
}
