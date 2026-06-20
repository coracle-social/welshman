import {first} from "@welshman/lib"
import {CLASSIFIED, getTag, getTagValue, getTagValues, getTopicTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

export type ClassifiedPrice = {
  amount: number
  currency: string
  frequency: string
}

const parsePrice = ([, amount = "0", currency = "SAT", frequency = ""]: string[]):
  | ClassifiedPrice
  | undefined => {
  const value = parseFloat(amount)

  if (!isNaN(value)) {
    return {amount: value, currency, frequency}
  }
}

// NIP-99 kind-30402 classified listing.
export class Classified extends EventReader {
  readonly kind = CLASSIFIED

  title() {
    return getTagValue("title", this.event.tags)
  }

  summary() {
    return getTagValue("summary", this.event.tags)
  }

  price(): ClassifiedPrice | undefined {
    const tag = getTag("price", this.event.tags)

    if (tag) {
      return parsePrice(tag)
    }
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

  titleTag?: string[]
  summaryTag?: string[]
  priceTag?: string[]
  statusTag?: string[]
  imageTags: string[][] = []
  topicTags: string[][] = []

  constructor(readonly reader?: Classified) {
    super(reader)

    this.titleTag = first(this.consumeTags("title"))
    this.summaryTag = first(this.consumeTags("summary"))
    this.priceTag = first(this.consumeTags("price"))
    this.statusTag = first(this.consumeTags("status"))
    this.imageTags = this.consumeTags("image")
    this.topicTags = this.consumeTags("t")
  }

  setTitle(title: string) {
    this.titleTag = ["title", title]

    return this
  }

  setSummary(summary: string) {
    this.summaryTag = ["summary", summary]

    return this
  }

  setPrice(amount: number, currency = "SAT", frequency = "") {
    this.priceTag = ["price", String(amount), currency, ...(frequency ? [frequency] : [])]

    return this
  }

  setStatus(status: string) {
    this.statusTag = ["status", status]

    return this
  }

  setImages(images: string[]) {
    this.imageTags = images.map(image => ["image", image])

    return this
  }

  setTopics(topics: string[]) {
    this.topicTags = topics.map(topic => ["t", topic])

    return this
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.titleTag) tags.push(this.titleTag)
    if (this.summaryTag) tags.push(this.summaryTag)
    if (this.priceTag) tags.push(this.priceTag)
    if (this.statusTag) tags.push(this.statusTag)

    tags.push(...this.topicTags)
    tags.push(...this.imageTags)

    return tags
  }
}
