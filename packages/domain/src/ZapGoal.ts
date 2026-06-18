import {ZAP_GOAL, getTagValue, getTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type ZapGoalValues = {
  title: string
  summary?: string
  amount: number
  relays: string[]
}

export const makeZapGoalValues = (values: Partial<ZapGoalValues> = {}): ZapGoalValues => ({
  title: "",
  amount: 0,
  relays: [],
  ...values,
})

// NIP-75 kind-9041 zap goal. A fundraising target that drives flotilla's goals
// feature: the goal title lives in `content` as plain text (not JSON), the body
// in a "summary" tag, the target amount in an "amount" tag (millisats, parsed as
// an int defaulting to 0), and the relays to tally receipts from in repeated
// "relays" tags; room scoping is handled by the base `group` behavior tag.
// Non-addressable (referenced by event id via "#E"); the funding tally is
// computed elsewhere from sibling zap receipts (ZAP_RESPONSE) and is not modeled
// here. Tags-only metadata, so it extends DomainObject directly.
export class ZapGoal extends DomainObject<ZapGoalValues> {
  readonly kind = ZAP_GOAL
  values = makeZapGoalValues()

  protected normalizeValues(values: Partial<ZapGoalValues> = {}) {
    return makeZapGoalValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<ZapGoalValues> {
    return {
      title: event.content || "",
      summary: getTagValue("summary", event.tags),
      amount: parseInt(getTagValue("amount", event.tags) || "0") || 0,
      relays: getTagValues("relays", event.tags),
    }
  }

  title() {
    return this.values.title
  }

  summary() {
    return this.values.summary
  }

  amount() {
    return this.values.amount
  }

  relays() {
    return this.values.relays
  }

  async toTemplate(): Promise<EventTemplate> {
    const tags: string[][] = []

    if (this.values.summary) {
      tags.push(["summary", this.values.summary])
    }

    tags.push(["amount", String(this.values.amount)])

    for (const relay of this.values.relays) {
      tags.push(["relays", relay])
    }

    return {kind: this.kind, content: this.values.title, tags}
  }
}
