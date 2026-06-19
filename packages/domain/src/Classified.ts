import {randomId} from "@welshman/lib"
import {CLASSIFIED, getTag, getTagValue, getTagValues, getTopicTagValues} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader, EventBuilder} from "./base.js"

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
  static kind = CLASSIFIED

  protected validate() {
    if (!this.identifier()) {
      throw new Error("Classified requires a d tag")
    }
  }

  protected reservedTagKeys() {
    return ["d", "title", "summary", "price", "status", "image", "t"]
  }

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
    const builder = new ClassifiedBuilder()

    builder.identifier = this.identifier() || ""
    builder.title = this.title()
    builder.summary = this.summary()
    builder.content = this.content()
    builder.price = this.price()
    builder.status = this.status()
    builder.images = this.images()
    builder.topics = this.topics()

    return this.seedBuilder(builder)
  }
}

export class ClassifiedBuilder extends EventBuilder {
  static kind = CLASSIFIED

  identifier = randomId()
  title?: string
  summary?: string
  content = ""
  price?: ClassifiedPrice
  status?: string
  images: string[] = []
  topics: string[] = []

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
