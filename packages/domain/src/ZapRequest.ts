import {ZAP_REQUEST, getTag, getTagValue} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type ZapRequestValues = {
  amount?: number
  lnurl?: string
  recipient?: string
  relays: string[]
  eventId?: string
  anonymous: boolean
  content: string
}

export const makeZapRequestValues = (
  values: Partial<ZapRequestValues> = {},
): ZapRequestValues => ({
  relays: [],
  anonymous: false,
  content: "",
  ...values,
})

// NIP-57 kind-9734 zap request: zap metadata in tags plus an optional comment in
// content. `amount` is in millisats.
export class ZapRequest extends DomainObject<ZapRequestValues> {
  readonly kind = ZAP_REQUEST
  values = makeZapRequestValues()

  protected normalizeValues(values: Partial<ZapRequestValues> = {}) {
    return makeZapRequestValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<ZapRequestValues> {
    const amount = getTagValue("amount", event.tags)
    const relaysTag = getTag("relays", event.tags)

    return {
      amount: amount ? parseInt(amount) : undefined,
      lnurl: getTagValue("lnurl", event.tags),
      recipient: getTagValue("p", event.tags),
      relays: relaysTag ? relaysTag.slice(1) : [],
      eventId: getTagValue("e", event.tags),
      anonymous: Boolean(event.tags.find(t => t[0] === "anon")),
      content: event.content,
    }
  }

  amount() {
    return this.values.amount
  }

  setAmount(amount: number) {
    this.values.amount = amount

    return this
  }

  lnurl() {
    return this.values.lnurl
  }

  setLnurl(lnurl: string) {
    this.values.lnurl = lnurl

    return this
  }

  recipient() {
    return this.values.recipient
  }

  setRecipient(recipient: string) {
    this.values.recipient = recipient

    return this
  }

  relays() {
    return this.values.relays
  }

  setRelays(relays: string[]) {
    this.values.relays = relays

    return this
  }

  eventId() {
    return this.values.eventId
  }

  setEventId(eventId: string) {
    this.values.eventId = eventId

    return this
  }

  isAnonymous() {
    return this.values.anonymous
  }

  setAnonymous(anonymous: boolean) {
    this.values.anonymous = anonymous

    return this
  }

  comment() {
    return this.values.content
  }

  setComment(content: string) {
    this.values.content = content

    return this
  }

  async toTemplate(): Promise<EventTemplate> {
    const {amount, lnurl, recipient, relays, eventId, anonymous, content} = this.values

    const tags: string[][] = [["relays", ...relays]]

    if (amount !== undefined) {
      tags.push(["amount", String(amount)])
    }

    if (lnurl !== undefined) {
      tags.push(["lnurl", lnurl])
    }

    if (recipient !== undefined) {
      tags.push(["p", recipient])
    }

    if (eventId) {
      tags.push(["e", eventId])
    }

    if (anonymous) {
      tags.push(["anon"])
    }

    return {kind: this.kind, tags, content}
  }
}
