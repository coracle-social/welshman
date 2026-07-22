import {spec} from "@welshman/lib"
import {CLASSIFIED, matchTag, tagSpec, tagValue, tagValues, topicTags} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

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
export class ClassifiedReader extends EventReader {
  title() {
    return tagValue(tagSpec("title"), this.event.tags)
  }

  summary() {
    return tagValue(tagSpec("summary"), this.event.tags)
  }

  price(): ClassifiedPrice | undefined {
    const tag = matchTag(tagSpec("price"), this.event.tags)

    if (tag) {
      return parsePrice(tag)
    }
  }

  status() {
    return tagValue(tagSpec("status"), this.event.tags)
  }

  images() {
    return tagValues(tagSpec("image"), this.event.tags)
  }

  topics() {
    return tagValues(topicTags("t"), this.event.tags)
  }
}

export class ClassifiedWriter extends EventWriter<ClassifiedReader> {
  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }

  setSummary(summary: string) {
    return this.dropTags(spec(["summary"])).addTags(["summary", summary])
  }

  setPrice(amount: number, currency = "SAT", frequency = "") {
    return this.dropTags(spec(["price"])).addTags([
      "price",
      String(amount),
      currency,
      ...(frequency ? [frequency] : []),
    ])
  }

  setStatus(status: string) {
    return this.dropTags(spec(["status"])).addTags(["status", status])
  }

  setImages(images: string[]) {
    return this.dropTags(spec(["image"])).addTags(...images.map(image => ["image", image]))
  }

  setTopics(topics: string[]) {
    return this.dropTags(spec(["t"])).addTags(...topics.map(topic => ["t", topic]))
  }
}

export const Classified = new KindFactory({
  kind: CLASSIFIED,
  reader: ClassifiedReader,
  writer: ClassifiedWriter,
})
