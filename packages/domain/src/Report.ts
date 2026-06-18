import {REPORT, getTag, getTagValue} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type ReportValues = {
  pubkey?: string
  eventId?: string
  reason?: string
  content: string
}

export const makeReportValues = (values: Partial<ReportValues> = {}): ReportValues => ({
  content: "",
  ...values,
})

// NIP-56 kind-1984 report, feeding flotilla's admin action-items / moderation
// review queue (see app/actionItems.ts `deriveSpaceActionItems`). The reported
// author is named in the "p" tag and the reported event in the "e" tag, with the
// report reason carried as the 3rd element of the "e" tag (NOT a separate tag).
// Flotilla destructures this by hand in ReactionSummary.svelte and
// ReportMenu.svelte; `reason()` centralizes that access. The report body lives in
// `content` as plain text (not JSON).
export class Report extends DomainObject<ReportValues> {
  readonly kind = REPORT
  values = makeReportValues()

  protected normalizeValues(values: Partial<ReportValues> = {}) {
    return makeReportValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<ReportValues> {
    const eTag = getTag("e", event.tags)

    return {
      pubkey: getTagValue("p", event.tags),
      eventId: eTag?.[1],
      reason: eTag?.[2],
      content: event.content || "",
    }
  }

  pubkey() {
    return this.values.pubkey
  }

  eventId() {
    return this.values.eventId
  }

  reason() {
    return this.values.reason
  }

  content() {
    return this.values.content
  }

  setContent(content: string) {
    this.values.content = content

    return this
  }

  async toTemplate(): Promise<EventTemplate> {
    const {pubkey, eventId, reason, content} = this.values
    const tags: string[][] = []

    if (pubkey) {
      tags.push(["p", pubkey])
    }

    if (eventId) {
      tags.push(["e", eventId, ...(reason ? [reason] : [])])
    }

    return {kind: this.kind, content, tags}
  }
}
