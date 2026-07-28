import {spec, uniq} from "@welshman/lib"
import {ZAP_GOAL, matchTags, tagSpec, tagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

// NIP-75 kind-9041 zap goal.
export class ZapGoalReader extends EventReader {
  title() {
    return this.event.content || ""
  }

  summary() {
    return tagValue(tagSpec("summary"), this.event.tags)
  }

  image() {
    return tagValue(tagSpec("image"), this.event.tags)
  }

  // Target amount, in millisats.
  amount() {
    return parseInt(tagValue(tagSpec("amount"), this.event.tags) || "0") || 0
  }

  // NIP-75 packs every relay into a single tag, but tolerate one-per-tag as well.
  urls() {
    return uniq(matchTags(tagSpec("relays"), this.event.tags).flatMap(tag => tag.slice(1)))
  }

  // Zap receipts published after this should not count toward the goal's progress.
  closedAt() {
    const closedAt = parseInt(tagValue(tagSpec("closed_at"), this.event.tags) ?? "")

    return isNaN(closedAt) ? undefined : closedAt
  }
}

export class ZapGoalWriter extends EventWriter<ZapGoalReader> {
  constructor(kind: number, context: KindContext, reader?: ZapGoalReader) {
    super(kind, context, reader)

    this.ensureAmount()
  }

  // A zap goal always carries an amount tag, defaulting to zero.
  private ensureAmount() {
    if (!this.extraTags.some(spec(["amount"]))) {
      this.addTags(["amount", "0"])
    }
  }

  setTitle(title: string) {
    return this.setContent(title)
  }

  setSummary(summary: string) {
    return this.dropTags(spec(["summary"])).addTags(["summary", summary])
  }

  setAmount(amount: number) {
    return this.dropTags(spec(["amount"])).addTags(["amount", String(amount)])
  }

  setImage(image: string) {
    return this.dropTags(spec(["image"])).addTags(["image", image])
  }

  setClosedAt(closedAt: number) {
    return this.dropTags(spec(["closed_at"])).addTags(["closed_at", String(closedAt)])
  }

  clearClosedAt() {
    return this.dropTags(spec(["closed_at"]))
  }

  // A single tag holding every relay, per NIP-75.
  setUrls(urls: string[]) {
    this.dropTags(spec(["relays"]))

    return urls.length > 0 ? this.addTags(["relays", ...urls]) : this
  }

  validate() {
    super.validate()

    if (!this.content) {
      throw new Error("ZapGoal requires a title")
    }

    // NIP-75 requires relays so zaps can be tallied; the constructor guarantees an amount.
    if (!this.extraTags.some(spec(["relays"]))) {
      throw new Error("ZapGoal requires at least one relay")
    }
  }
}

export const ZapGoal = new KindFactory({
  kind: ZAP_GOAL,
  reader: ZapGoalReader,
  writer: ZapGoalWriter,
})
