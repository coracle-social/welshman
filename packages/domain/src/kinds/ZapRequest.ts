import {first} from "@welshman/lib"
import {ZAP_REQUEST, getTag, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-57 kind-9734 zap request.
export class ZapRequest extends EventReader {
  readonly kind = ZAP_REQUEST

  amount() {
    const amount = getTagValue("amount", this.event.tags)

    return amount ? parseInt(amount) : undefined
  }

  lnurl() {
    return getTagValue("lnurl", this.event.tags)
  }

  recipient() {
    return getTagValue("p", this.event.tags)
  }

  eventId() {
    return getTagValue("e", this.event.tags)
  }

  urls() {
    const tag = getTag("relays", this.event.tags)

    return tag ? tag.slice(1) : []
  }

  comment() {
    return this.event.content
  }

  builder() {
    return new ZapRequestBuilder(this)
  }
}

export class ZapRequestBuilder extends EventBuilder<ZapRequest> {
  readonly kind = ZAP_REQUEST

  amountTag?: string[]
  lnurlTag?: string[]
  recipientTag?: string[]
  eventIdTag?: string[]
  relaysTag?: string[]
  comment = ""

  constructor(readonly reader?: ZapRequest) {
    super(reader)

    this.amountTag = first(this.consumeTags("amount"))
    this.lnurlTag = first(this.consumeTags("lnurl"))
    this.recipientTag = first(this.consumeTags("p"))
    this.eventIdTag = first(this.consumeTags("e"))
    this.relaysTag = first(this.consumeTags("relays"))
    this.comment = reader?.event.content ?? ""
  }

  setAmount(amount: number) {
    this.amountTag = ["amount", String(amount)]

    return this
  }

  setLnurl(lnurl: string) {
    this.lnurlTag = ["lnurl", lnurl]

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

  setUrls(urls: string[]) {
    this.relaysTag = ["relays", ...urls]

    return this
  }

  setComment(comment: string) {
    this.comment = comment

    return this
  }

  protected buildTags() {
    const tags: string[][] = [this.relaysTag ?? ["relays"]]

    if (this.amountTag) tags.push(this.amountTag)
    if (this.lnurlTag) tags.push(this.lnurlTag)
    if (this.recipientTag) tags.push(this.recipientTag)
    if (this.eventIdTag) tags.push(this.eventIdTag)

    return tags
  }

  protected buildContent() {
    return this.comment
  }
}
