import {spec} from "@welshman/lib"
import {ZAP_GOAL, getTagValue, getTagValues} from "@welshman/util"
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
    return getTagValue("summary", this.event.tags)
  }

  amount() {
    return parseInt(getTagValue("amount", this.event.tags) || "0") || 0
  }

  urls() {
    return getTagValues("relays", this.event.tags)
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

  setUrls(urls: string[]) {
    return this.dropTags(spec(["relays"])).addTags(...urls.map(url => ["relays", url]))
  }

  validate() {
    super.validate()

    if (!this.content) {
      throw new Error("ZapGoal requires a title")
    }
  }
}

export const ZapGoal = new KindFactory({
  kind: ZAP_GOAL,
  reader: ZapGoalReader,
  writer: ZapGoalWriter,
})
