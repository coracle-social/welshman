import {ZAP_GOAL, getTagValue, getTagValues} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-75 kind-9041 zap goal. A fundraising target that drives flotilla's goals
// feature: the goal title lives in `content` as plain text (not JSON), the body
// in a "summary" tag, the target amount in an "amount" tag (millisats, parsed as
// an int defaulting to 0), and the relays to tally receipts from in repeated
// "relays" tags; room scoping is handled by the base `group` behavior tag.
// Non-addressable (referenced by event id via "#E"); the funding tally is
// computed elsewhere from sibling zap receipts (ZAP_RESPONSE) and is not modeled
// here. Tags + plain-text content, so it extends EventReader/EventBuilder.
export class ZapGoal extends EventReader {
  static kind = ZAP_GOAL

  protected validate() {
    if (!this.title()) {
      throw new Error("ZapGoal requires a title")
    }
  }

  protected reservedTagKeys() {
    return ["summary", "amount", "relays"]
  }

  // The goal title is plain-text content, not JSON or encrypted.
  title() {
    return this.event.content || ""
  }

  summary() {
    return getTagValue("summary", this.event.tags)
  }

  amount() {
    return parseInt(getTagValue("amount", this.event.tags) || "0") || 0
  }

  relays() {
    return getTagValues("relays", this.event.tags)
  }

  builder() {
    const builder = new ZapGoalBuilder(this.title())

    builder.summary = this.summary()
    builder.amount = this.amount()
    builder.relays = this.relays()

    return this.seedBuilder(builder)
  }
}

export class ZapGoalBuilder extends EventBuilder {
  static kind = ZAP_GOAL

  summary?: string
  amount = 0
  relays: string[] = []

  constructor(public title = "") {
    super()
  }

  setTitle(title: string) {
    this.title = title

    return this
  }

  setSummary(summary: string) {
    this.summary = summary

    return this
  }

  setAmount(amount: number) {
    this.amount = amount

    return this
  }

  setRelays(relays: string[]) {
    this.relays = relays

    return this
  }

  protected validate() {
    if (!this.title) {
      throw new Error("ZapGoal requires a title")
    }
  }

  protected buildContent() {
    return this.title
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.summary) tags.push(["summary", this.summary])

    tags.push(["amount", String(this.amount)])

    for (const relay of this.relays) {
      tags.push(["relays", relay])
    }

    return tags
  }
}
