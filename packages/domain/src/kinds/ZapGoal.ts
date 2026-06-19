import {first} from "@welshman/lib"
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

  title = ""
  summaryTag?: string[]
  amountTag?: string[]
  urlTags: string[][] = []

  constructor(readonly reader?: ZapGoal) {
    super(reader)

    this.title = reader?.title() ?? ""
    this.summaryTag = first(this.consumeTags("summary"))
    this.amountTag = first(this.consumeTags("amount"))
    this.urlTags = this.consumeTags("relays")
  }

  setTitle(title: string) {
    this.title = title

    return this
  }

  setSummary(summary: string) {
    this.summaryTag = ["summary", summary]

    return this
  }

  setAmount(amount: number) {
    this.amountTag = ["amount", String(amount)]

    return this
  }

  setUrls(urls: string[]) {
    this.urlTags = urls.map(url => ["relays", url])

    return this
  }

  protected validate() {
    super.validate()

    if (!this.title) {
      throw new Error("ZapGoal requires a title")
    }
  }

  protected buildContent() {
    return this.title
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.summaryTag) tags.push(this.summaryTag)

    tags.push(this.amountTag ?? ["amount", "0"])
    tags.push(...this.urlTags)

    return tags
  }
}
