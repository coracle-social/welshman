import {first} from "@welshman/lib"
import {ZAP_GOAL, getTagValue, getTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-75 kind-9041 zap goal. A fundraising target that drives flotilla's goals
// feature: the goal title lives in `content` as plain text (not JSON), the body
// in a "summary" tag, the target amount in an "amount" tag (millisats, parsed as
// an int defaulting to 0), and the relays to tally receipts from in repeated
// "relays" tags; room scoping is handled by the base `group` behavior tag.
// Non-addressable (referenced by event id via "#E"); the funding tally is
// computed elsewhere from sibling zap receipts (ZAP_RESPONSE) and is not modeled
// here. Tags + plain-text content, so it extends EventReader/EventBuilder.
export class ZapGoal extends EventReader {
  readonly kind = ZAP_GOAL

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
    return new ZapGoalBuilder(this)
  }
}

export class ZapGoalBuilder extends EventBuilder<ZapGoal> {
  readonly kind = ZAP_GOAL

  title = ""
  summary?: string
  amount = 0
  relays: string[] = []

  constructor(readonly reader?: ZapGoal) {
    super(reader)

    // Consume the represented tags out of the carried-over extraTags so they
    // round-trip through the structured fields below rather than being emitted
    // twice (once from buildTags, once from the base's extraTags pass-through).
    this.title = reader?.title() ?? ""
    this.summary = first(this.consumeTags("summary"))?.[1]
    this.amount = parseInt(first(this.consumeTags("amount"))?.[1] || "0") || 0
    this.relays = this.consumeTags("relays").map(t => t[1])
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
