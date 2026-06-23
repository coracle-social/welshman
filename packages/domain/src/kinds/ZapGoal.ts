import {spec} from "@welshman/lib"
import {ZAP_GOAL, getTagValue, getTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-75 kind-9041 zap goal.
export class ZapGoal extends EventReader {
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

  builder() {
    return new ZapGoalBuilder(this)
  }
}

export class ZapGoalBuilder extends EventBuilder<ZapGoal> {
  readonly kind = ZAP_GOAL

  constructor(reader?: ZapGoal) {
    super(reader)

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
