import {spec} from "@welshman/lib"
import {ZAP_GOAL, getTagValue, getTagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"
import type {AnyConfiguredKind} from "../core/Kind.js"

// NIP-75 kind-9041 zap goal.
export class ZapGoalReader extends EventReader {
  readonly kind = ZAP_GOAL

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
  readonly kind = ZAP_GOAL

  constructor(def: AnyConfiguredKind, reader?: ZapGoalReader) {
    super(def, reader)

    // A zap goal always carries an amount tag, defaulting to zero.
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

  protected validate() {
    super.validate()

    if (!this.content) {
      throw new Error("ZapGoal requires a title")
    }
  }
}

export const ZapGoal = new KindFactory({
  reader: ZapGoalReader,
  writer: ZapGoalWriter,
})
