import {first} from "@welshman/lib"
import {ZAP_REQUEST, getTag, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-57 kind-9734 zap request: zap metadata in tags plus an optional comment in
// content. `amount` is in millisats. Tags-only structured data; the comment lives
// in the event content.
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
    return new ZapRequestBuilder(this)
  }
}

export class ZapRequestBuilder extends EventBuilder<ZapRequest> {
  readonly kind = ZAP_REQUEST

  amount?: number
  lnurl?: string
  recipient?: string
  eventId?: string
  relays: string[] = []
  anonymous = false
  comment = ""

  constructor(readonly reader?: ZapRequest) {
    super(reader)

    // Consume the represented tags out of the carried-over extraTags so they
    // round-trip through the structured fields below rather than being emitted
    // twice (once from buildTags, once from the base's extraTags pass-through).
    const amount = first(this.consumeTags("amount"))
    const anon = first(this.consumeTags("anon"))

    this.amount = amount ? parseInt(amount[1]) : undefined
    this.lnurl = first(this.consumeTags("lnurl"))?.[1]
    this.recipient = first(this.consumeTags("p"))?.[1]
    this.eventId = first(this.consumeTags("e"))?.[1]
    this.relays = first(this.consumeTags("relays"))?.slice(1) ?? []
    this.anonymous = Boolean(anon)
    this.comment = reader?.event.content ?? ""
  }

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
