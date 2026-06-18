import {
  CLASSIFIED,
  getAddress,
  getIdentifier,
  getTag,
  getTagValue,
  getTagValues,
  getTopicTagValues,
} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type ClassifiedValues = {
  identifier: string
  title?: string
  summary?: string
  content: string
  price?: {amount: number; currency: string}
  status?: string
  images: string[]
  topics: string[]
  h?: string
}

export const makeClassifiedValues = (
  values: Partial<ClassifiedValues> = {},
): ClassifiedValues => ({
  identifier: "",
  content: "",
  images: [],
  topics: [],
  ...values,
})

// NIP-99 kind-30402 addressable classified listing. Addressable via the "d"
// tag; the listing description lives in `content` as plain text (not JSON). The
// price is carried in a ["price", amount, currency] tag with the currency
// defaulting to "SAT", images in repeated "image" tags, topics in "t" tags, and
// an optional "h" tag scopes the listing to a room. Tags-only metadata, so it
// extends DomainObject directly. Commented via "#A" (kind 1111 comments).
export class Classified extends DomainObject<ClassifiedValues> {
  readonly kind = CLASSIFIED
  values = makeClassifiedValues()

  protected normalizeValues(values: Partial<ClassifiedValues> = {}) {
    return makeClassifiedValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<ClassifiedValues> {
    const priceTag = getTag("price", event.tags)

    return {
      identifier: getIdentifier(event) || "",
      title: getTagValue("title", event.tags),
      summary: getTagValue("summary", event.tags),
      content: event.content || "",
      price: priceTag
        ? {amount: parseFloat(priceTag[1]) || 0, currency: priceTag[2] || "SAT"}
        : undefined,
      status: getTagValue("status", event.tags),
      images: getTagValues("image", event.tags),
      topics: getTopicTagValues(event.tags),
      h: getTagValue("h", event.tags),
    }
  }

  identifier() {
    return this.values.identifier
  }

  title() {
    return this.values.title
  }

  summary() {
    return this.values.summary
  }

  content() {
    return this.values.content
  }

  price() {
    return this.values.price
  }

  status() {
    return this.values.status
  }

  images() {
    return this.values.images
  }

  topics() {
    return this.values.topics
  }

  h() {
    return this.values.h
  }

  room() {
    return this.values.h
  }

  address() {
    return getAddress(this.event!)
  }

  async toTemplate(): Promise<EventTemplate> {
    const tags: string[][] = [["d", this.values.identifier]]

    if (this.values.title) {
      tags.push(["title", this.values.title])
    }

    if (this.values.summary) {
      tags.push(["summary", this.values.summary])
    }

    if (this.values.price) {
      tags.push(["price", String(this.values.price.amount), this.values.price.currency])
    }

    if (this.values.status) {
      tags.push(["status", this.values.status])
    }

    for (const topic of this.values.topics) {
      tags.push(["t", topic])
    }

    for (const image of this.values.images) {
      tags.push(["image", image])
    }

    if (this.values.h) {
      tags.push(["h", this.values.h])
    }

    return {kind: this.kind, content: this.values.content, tags}
  }
}
