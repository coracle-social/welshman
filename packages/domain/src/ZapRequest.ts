import {ZAP_REQUEST, getTag, getTagValue} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-57 kind-9734 zap request: zap metadata in tags plus an optional comment in
// content. `amount` is in millisats. Tags-only structured data; the comment lives
// in the event content.
export class ZapRequest extends EventReader {
  static kind = ZAP_REQUEST

  protected reservedTagKeys() {
    return ["amount", "lnurl", "p", "e", "relays", "anon"]
  }

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

  relays() {
    const tag = getTag("relays", this.event.tags)

    return tag ? tag.slice(1) : []
  }

  isAnonymous() {
    return this.event.tags.some(t => t[0] === "anon")
  }

  comment() {
    return this.event.content
  }

  builder() {
    const builder = new ZapRequestBuilder()

    builder.amount = this.amount()
    builder.lnurl = this.lnurl()
    builder.recipient = this.recipient()
    builder.eventId = this.eventId()
    builder.relays = this.relays()
    builder.anonymous = this.isAnonymous()
    builder.comment = this.comment()

    return this.seedBuilder(builder)
  }
}

export class ZapRequestBuilder extends EventBuilder {
  static kind = ZAP_REQUEST

  amount?: number
  lnurl?: string
  recipient?: string
  eventId?: string
  relays: string[] = []
  anonymous = false
  comment = ""

  setAmount(amount: number) {
    this.amount = amount

    return this
  }

  setLnurl(lnurl: string) {
    this.lnurl = lnurl

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

  setRelays(relays: string[]) {
    this.relays = relays

    return this
  }

  setAnonymous(anonymous = true) {
    this.anonymous = anonymous

    return this
  }

  setComment(comment: string) {
    this.comment = comment

    return this
  }

  protected buildTags() {
    const tags: string[][] = [["relays", ...this.relays]]

    if (this.amount !== undefined) tags.push(["amount", String(this.amount)])
    if (this.lnurl !== undefined) tags.push(["lnurl", this.lnurl])
    if (this.recipient !== undefined) tags.push(["p", this.recipient])
    if (this.eventId) tags.push(["e", this.eventId])
    if (this.anonymous) tags.push(["anon"])

    return tags
  }

  protected buildContent() {
    return this.comment
  }
}
