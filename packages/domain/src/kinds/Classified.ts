import {first, randomId} from "@welshman/lib"
import {CLASSIFIED, getTag, getTagValue, getTagValues, getTopicTagValues} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

export type ClassifiedPrice = {
  amount: number
  currency: string
}

// NIP-99 kind-30402 addressable classified listing. Addressable via the "d" tag;
// the listing description lives in `content` as plain text (not JSON). The price
// is carried in a ["price", amount, currency] tag with the currency defaulting to
// "SAT", images in repeated "image" tags, and topics in "t" tags; room scoping is
// handled by the base `group` behavior tag. Plain-text content, so it extends
// EventReader/EventBuilder directly.
export class Classified extends EventReader {
  readonly kind = CLASSIFIED

  title() {
    return getTagValue("title", this.event.tags)
  }

  summary() {
    return getTagValue("summary", this.event.tags)
  }

  content() {
    return this.event.content
  }

  price(): ClassifiedPrice | undefined {
    const tag = getTag("price", this.event.tags)

    return tag ? {amount: parseFloat(tag[1]) || 0, currency: tag[2] || "SAT"} : undefined
  }

  status() {
    return getTagValue("status", this.event.tags)
  }

  images() {
    return getTagValues("image", this.event.tags)
  }

  topics() {
    return getTopicTagValues(this.event.tags)
  }

  builder() {
    return new ClassifiedBuilder(this)
  }
}

export class ClassifiedBuilder extends EventBuilder<Classified> {
  readonly kind = CLASSIFIED

  identifier = randomId()
  title?: string
  summary?: string
  content = ""
  price?: ClassifiedPrice
  status?: string
  images: string[] = []
  topics: string[] = []

  constructor(readonly reader?: Classified) {
    super(reader)

    // Consume the represented tags out of the carried-over extraTags so they
    // round-trip through the structured fields below rather than being emitted
    // twice (once from buildTags, once from the base's extraTags pass-through).
    const d = first(this.consumeTags("d"))
    const price = first(this.consumeTags("price"))

    this.identifier = d?.[1] || randomId()
    this.title = first(this.consumeTags("title"))?.[1]
    this.summary = first(this.consumeTags("summary"))?.[1]
    this.content = reader?.event.content ?? ""
    this.price = price ? {amount: parseFloat(price[1]) || 0, currency: price[2] || "SAT"} : undefined
    this.status = first(this.consumeTags("status"))?.[1]
    this.images = this.consumeTags("image").map(t => t[1])
    this.topics = this.consumeTags("t").map(t => t[1])
  }

  setTitle(title: string) {
    this.title = title

    return this
  }

  setSummary(summary: string) {
    this.summary = summary

    return this
  }

  setContent(content: string) {
    this.content = content

    return this
  }

  setPrice(amount: number, currency = "SAT") {
    this.price = {amount, currency}

    return this
  }

  setStatus(status: string) {
    this.status = status

    return this
  }

  setImages(images: string[]) {
    this.images = images

    return this
  }

  setTopics(topics: string[]) {
    this.topics = topics

    return this
  }

  protected validate() {
    if (!this.identifier) {
      throw new Error("Classified requires a d identifier")
    }
  }

  protected buildContent(_signer?: ISigner) {
    return this.content
  }

  protected buildTags() {
    const tags: string[][] = [["d", this.identifier]]

    if (this.title) tags.push(["title", this.title])
    if (this.summary) tags.push(["summary", this.summary])
    if (this.price) tags.push(["price", String(this.price.amount), this.price.currency])
    if (this.status) tags.push(["status", this.status])

    for (const topic of this.topics) {
      tags.push(["t", topic])
    }

    for (const image of this.images) {
      tags.push(["image", image])
    }

    return tags
  }
}
